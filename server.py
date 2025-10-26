import os
import secrets
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Annotated, Optional

from fastapi import FastAPI, Depends, Form, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from smtp_settings import SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM
from db import SessionLocal, User, Pageview, get_db

# ----------------------
# Scheduler setup
# ----------------------
import threading
import time

def scheduler_loop():
    # Fires every minute; when it's Saturday 09:00 local server time, send digests once
    sent_today = False
    while True:
        now = datetime.now()
        if now.weekday() == 5 and now.hour == 9:
            if not sent_today:
                send_all_digests()
                sent_today = True
        else:
            sent_today = False
        time.sleep(60)

# ----------------------
# FastAPI app
# ----------------------
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start background scheduler thread on startup
    t = threading.Thread(target=scheduler_loop, daemon=True)
    t.start()
    app.state.scheduler_thread = t
    yield
    # No explicit teardown needed; thread is daemon and will exit with process

app = FastAPI(title="Modest Analytics", lifespan=lifespan)

# Serve static files and allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------
# Schemas
# ----------------------
class RegisterRequest(BaseModel):
    email: EmailStr

class VerifyRequest(BaseModel):
    email: EmailStr
    code: str

# ----------------------
# Email helpers
# ----------------------

def send_email(to_email: str, subject: str, body_text: str, body_html: Optional[str] = None):
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    if body_html:
        msg.set_content(body_text)
        msg.add_alternative(body_html, subtype="html")
    else:
        msg.set_content(body_text)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.send_message(msg)

# ----------------------
# Utility
# ----------------------

def issue_verification_code(db: Session, user: User) -> str:
    code = f"{secrets.randbelow(1_000_000):06d}"  # 6-digit, zero-padded
    user.verification_code = code
    user.verification_code_expiry = datetime.now(timezone.utc) + timedelta(minutes=10)
    db.add(user)
    db.commit()
    db.refresh(user)
    return code

def generate_token() -> str:
    return secrets.token_urlsafe(16)

def as_aware_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        # Treat naive values as UTC (how we stored them)
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

# ----------------------
# Routes
# ----------------------

@app.post("/register")
async def register(req: RegisterRequest, db: Session = Depends(get_db)):
    email = req.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email, token=generate_token())
        db.add(user)
        db.commit()
        db.refresh(user)
    code = issue_verification_code(db, user)

    body_text = f"Your verification code is: {code}\nIt expires in 10 minutes."
    body_html = f"<p>Your verification code is: <strong>{code}</strong></p><p>This code expires in 10 minutes.</p>"

    try:
        send_email(email, "Your Modest Analytics verification code", body_text, body_html)
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail="Failed to send verification email.")

    return {"message": "Verification code sent."}

@app.post("/verify")
async def verify(req: VerifyRequest, db: Session = Depends(get_db)):
    email = req.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.verification_code:
        raise HTTPException(status_code=400, detail="No verification pending for this email.")

    now = datetime.now(timezone.utc)
    if not user.verification_code_expiry or now > as_aware_utc(user.verification_code_expiry):
        raise HTTPException(status_code=400, detail="Verification code expired. Please request a new one.")

    if req.code.strip() != user.verification_code:
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    user.verification_code = None
    user.verification_code_expiry = None
    db.add(user)
    db.commit()

    js_snippet = (
        '<script src="https://modestanalytics.com/embed.js" '
        f'data-token="{user.token}"></script>'
    )
    return {"snippet": js_snippet, "token": user.token}

@app.post("/pageview")
async def pageview(
    token: Annotated[str, Form()],
    domain: Annotated[str, Form()],
    path: Annotated[str, Form()],
    referrer: Annotated[str, Form()],
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.token == token).first()
    if not user:
        raise HTTPException(status_code=404, detail="Unknown token.")
    pageview_token = secrets.token_urlsafe(16)
    pv = Pageview(
        user_id=user.id,
        domain=domain.strip()[:255],
        path=path.strip()[:512],
        referrer=referrer.strip()[:1024],
        time_spent_on_page=0,
        token=pageview_token,
    )
    db.add(pv)
    db.commit()
    return {"token": pageview_token}

@app.post("/heartbeat")
async def heartbeat(
    token: Annotated[str, Form()],
    time_spent_on_page: Annotated[int, Form()],
    db: Session = Depends(get_db),
):
    pv = db.query(Pageview).filter(Pageview.token == token).first()
    if not pv:
        raise HTTPException(status_code=404, detail="Pageview not found.")
    pv.time_spent_on_page = time_spent_on_page
    db.add(pv)
    db.commit()
    return {"status": "ok"}

app.mount("/", StaticFiles(directory="static", html=True), name="static")

# ----------------------
# Weekly digest
# ----------------------

def build_digest(db: Session, user: User) -> tuple[str, str]:
    """
    Build a weekly digest for the *last 7 days* in the server's local timezone.
    """
    # Use local timezone rather than UTC
    local_tz = datetime.now().astimezone().tzinfo
    now = datetime.now()
    start = now - timedelta(days=7)

    rows = (
        db.query(Pageview.domain, Pageview.path, Pageview.referrer, Pageview.time_spent_on_page)
        .filter(
            Pageview.user_id == user.id,
            Pageview.timestamp >= start,
            Pageview.timestamp < now,
        )
        .all()
    )

    total = len(rows)

    # Aggregate per (domain, path)
    counts: dict[tuple[str, str], int] = {}
    referrer_per_page: dict[tuple[str, str], dict[str, int]] = {}
    time_spent_on_page_totals: dict[tuple[str, str], list[int]] = {}

    for d, p, r, t in rows:
        key = (d or "", p or "")
        counts[key] = counts.get(key, 0) + 1

        if r:
            if key not in referrer_per_page:
                referrer_per_page[key] = {}
            referrer_per_page[key][r] = referrer_per_page[key].get(r, 0) + 1

        if key not in time_spent_on_page_totals:
            time_spent_on_page_totals[key] = []
        time_spent_on_page_totals[key].append(t)

    period_str = f"{start.strftime('%Y-%m-%d')} → {now.strftime('%Y-%m-%d')} ({local_tz})"

    sorted_results = sorted(counts.items(), key=lambda x: (-x[1], x[0]))

    # Calculate top referrer per (domain, path)
    top_referrer_per_page: dict[tuple[str, str], str] = {}
    for key, referrers in referrer_per_page.items():
        top_referrer_per_page[key] = max(referrers, key=referrers.get)

    # Calculate average time spent on page per (domain, path)
    average_time_spent_on_page: dict[tuple[str, str], int] = {}
    for key, times in time_spent_on_page_totals.items():
        average_time_spent_on_page[key] = sum(times) / len(times)

    # Text version
    lines = [
        "Your weekly website stats",
        f"Period: {period_str}",
        f"Total pageviews (last 7 days): {total}",
        "",
        "Per page:",
    ]
    for (d, p), c in sorted_results:
        avg_time = average_time_spent_on_page.get((d, p), 0)
        top_ref = top_referrer_per_page.get((d, p), "N/A")
        lines.append(f"- {d}{p} — {c} views, avg time: {avg_time}s, top referrer: {top_ref}")
    text = "\n".join(lines)

    # HTML version
    html_rows = "".join(
        f"<tr><td>{d}</td><td>{p}</td><td style='text-align:right'>{c}</td><td style='text-align:right'>{average_time_spent_on_page.get((d, p), 0)}s</td><td>{top_referrer_per_page.get((d, p), "N/A")}</td></tr>"
        for (d, p), c in sorted_results
    )
    if not html_rows:
        html_rows = "<tr><td colspan='5'>No data in the last 7 days</td></tr>"

    html = f"""
    <h2>Your weekly website stats</h2>
    <p><strong>Period:</strong> {period_str}</p>
    <p><strong>Total pageviews (last 7 days):</strong> {total}</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">
      <thead><tr><th>Domain</th><th>Path</th><th>Views</th><th>Avg. Time</th><th>Top Referrer</th></tr></thead>
      <tbody>{html_rows}</tbody>
    </table>
    """

    return text, html

def send_all_digests():
    db = SessionLocal()
    try:
        users = db.query(User).all()
        for u in users:
            text, html = build_digest(db, u)
            try:
                send_email(u.email, "Your weekly website stats", text, html)
            except Exception:
                pass
    finally:
        db.close()

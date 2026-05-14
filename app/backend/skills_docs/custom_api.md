# Backend Custom API

## Description
Backend custom API development with FastAPI. Covers service logic implementation under services/, API endpoint routing under routers/, automatic routing, environment variables, and a complete Stripe payment integration example including create_payment_session and verify_payment.

## Guide

## Backend Custom API Integration
- Implement the service logic of custom functions under `./app/backend/services/`
- Define api endpoint routing and implement it under `./app/backend/routers/`. Import the necessary ORM files under `./app/backend/models/` and the necessary logic files under `./app/backend/services/`
- Since automatic routing has been added, there is no need to add api route manually
- Frontend MUST call custom routers through `metagptx/web-sdk@latest` with `client.apiCall.invoke(...)`; see `./app/backend/skills_docs/web_sdk.md` for frontend rules and examples
  - Pass only the route path such as `/api/v1/payment/create_payment_session`
  - Do NOT use `fetch`, `axios`, `getAPIBaseURL`, `VITE_API_BASE_URL`, `http://localhost`, or `http://127.0.0.1`
- To obtain environment variables from os environ, must use like `import os\nstripe_key = os.environ.get("STRIPE_SECRET_KEY")  # Pay attention to capitalization
- If installed new backend packages, append them to the `./app/backend/requirements.txt`
- Follow the existing backend import conventions used by nearby router files. For database/auth dependencies, use `from core.database import get_db` and `from dependencies.auth import get_current_user` (or `get_admin_user`) as appropriate.
- If you create or modify backend Python files for this custom API work, run `python -m py_compile` on the changed Python files before finishing. If it fails, fix the errors.

### Backend Example Code
```python
# @File: backend/routers/payments.py
# @Desc: api route for payment example
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
import stripe

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from models.orders import Orders
from core.config import settings

stripe.api_key = settings.stripe_secret_key  # Configure Stripe Key

router = APIRouter(prefix="/api/v1/payment", tags=["payment"])  # prefix MUST starts with "/api/v1"

class CheckoutSessionRequest(BaseModel):
    success_url: str
    cancel_url: str

class CheckoutSessionResponse(BaseModel):
    session_id: str
    url: str

class PaymentVerificationRequest(BaseModel):
    session_id: str

class PaymentStatusResponse(BaseModel):
    status: str
    order_id: int = None
    payment_status: str

@router.post("/create_payment_session", response_model=CheckoutSessionResponse)
async def create_payment_session(
    data: CheckoutSessionRequest,
    request: Request,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    "Create a Stripe checkout session from the user's cart items"
    try:
        # Get frontend host
        frontend_host = request.headers.get("App-Host")  # Check if it starts with https/http, must be "App-Host" if you want to get frontend host
        if frontend_host and not frontend_host.startswith(("http://", "https://")):
            # Default to add https
            frontend_host = f"https://{frontend_host}"
        # [CRITICAL] Implementation Steps
        # 1. Validates the cart items and calculates the total amount
        # 2. Creates a new order in the database with status "pending"
        line_items = []  # collect cart items except for the image_url of the item
        # 3. Create Stripe checkout session
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=line_items,
            mode="payment",
            success_url=f"{frontend_host}/payment-success?session_id={{CHECKOUT_SESSION_ID}}",  # Frontend url to receive checkout session id
            cancel_url=f"{frontend_host}/checkout",  # Frontend url to redirect when cancel payment
            metadata={
                "order_id": str(order.id),
                "user_id": current_user.id
            }  # used to store metadata
        )  # Frontend must contain success_url(params should be `session_id={CHECKOUT_SESSION_ID}`) and cancel_url
        # 4. Save session_id into order. [CRITICAL] If the model has auto-managed `created_at` / `updated_at`,
        #    do not update them manually here; only persist business fields such as session_id or status.
        # 5. Return session_id and sesssion_url to the frontend. 
        return CheckoutSessionResponse(
            session_id=session.id,
            url=session.url
        )
    except Exception as e:
        logging.error(f"Payment session creation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create payment session, error: {str(e)}")

@router.post("/verify_payment", response_model=PaymentStatusResponse)
async def verify_payment(
    data: PaymentVerificationRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    "Verify payment status and update order"
    try:
        # [CRITICAL] Implementation Steps
        # 1. Retrieve the session from Stripe
        session = stripe.checkout.Session.retrieve(data.session_id)
        order_id = session.metadata.get("order_id")
        # 2. Update order's payment status
        status_mapping = {"complete": "paid", "open": "pending", "expired": "cancelled"}
        status = status_mapping.get(session.status, "pending")
        # 3. Return payment status to the frontend
        return PaymentStatusResponse(
            status=status,
            order_id=int(order_id),
            payment_status=session.payment_status
        )
    except Exception as e:
        logging.error(f"Payment verification error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to verify payment, error: {str(e)}")
```

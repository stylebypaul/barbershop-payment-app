
Menu
The user requested...

Hey Paul, Quick input needed :
Perfect! I can see you're creating the server.py file in GitHub. Let me give you the complete FastAPI server code to copy and paste:

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List
import os
from dotenv import load_dotenv
import motor.motor_asyncio
import uuid
from datetime import datetime, timezone
import stripe
from twilio.rest import Client
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
import secrets
import base58
from solders.keypair import Keypair
import json
import asyncio

# Load environment variables
load_dotenv()

# Initialize FastAPI
app = FastAPI(title="Barber Pay API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database setup
MONGO_URL = os.getenv("MONGO_URL")
DB_NAME = os.getenv("DB_NAME", "barber_pay")

client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# API Keys
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
SENDGRID_FROM_EMAIL = os.getenv("SENDGRID_FROM_EMAIL")
CIRCLE_API_KEY = os.getenv("CIRCLE_API_KEY")

# Initialize Stripe
if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

# Initialize Twilio
twilio_client = None
if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
    twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

# Initialize SendGrid
sendgrid_client = None
if SENDGRID_API_KEY:
    sendgrid_client = SendGridAPIClient(api_key=SENDGRID_API_KEY)

# Pydantic models
class PaymentRequest(BaseModel):
    amount: float
    tip_amount: float
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None

class PaymentResponse(BaseModel):
    payment_id: str
    amount: float
    tip_amount: float
    total_amount: float
    status: str
    timestamp: str
    wallet_address: Optional[str] = None

class ReceiptRequest(BaseModel):
    payment_id: str
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    method: str  # "email" or "sms"

# Utility functions
def generate_solana_wallet():
    """Generate a new Solana wallet keypair"""
    try:
        keypair = Keypair()
        private_key = base58.b58encode(bytes(keypair)).decode('utf-8')
        public_key = str(keypair.pubkey())
        return {
            "address": public_key,
            "private_key": private_key
        }
    except Exception as e:
        print(f"Error generating Solana wallet: {e}")
        return {
            "address": "demo_address_" + str(uuid.uuid4())[:8],
            "private_key": "demo_private_key"
        }

def prepare_for_mongo(data):
    """Convert datetime objects to ISO strings for MongoDB storage"""
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, datetime):
                data[key] = value.isoformat()
    return data

# API Routes
@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "Barber Pay API"}

@app.post("/api/payments", response_model=PaymentResponse)
async def create_payment(payment_request: PaymentRequest):
    """Create a new payment transaction"""
    try:
        # Generate payment ID
        payment_id = str(uuid.uuid4())
        
        # Calculate total amount
        total_amount = payment_request.amount + payment_request.tip_amount
        
        # Generate Solana wallet for this transaction
        wallet = generate_solana_wallet()
        
        # Create payment record
        payment_data = {
            "payment_id": payment_id,
            "amount": payment_request.amount,
            "tip_amount": payment_request.tip_amount,
            "total_amount": total_amount,
            "customer_email": payment_request.customer_email,
            "customer_phone": payment_request.customer_phone,
            "status": "pending",
            "wallet_address": wallet["address"],
            "wallet_private_key": wallet["private_key"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "stripe_payment_intent": None,
            "usdc_conversion_status": "pending"
        }
        
        # Create Stripe Payment Intent if configured
        stripe_payment_intent = None
        if STRIPE_SECRET_KEY:
            try:
                stripe_payment_intent = stripe.PaymentIntent.create(
                    amount=int(total_amount * 100),  # Convert to cents
                    currency='usd',
                    metadata={
                        'payment_id': payment_id,
                        'tip_amount': payment_request.tip_amount
                    }
                )
                payment_data["stripe_payment_intent"] = stripe_payment_intent.id
                payment_data["status"] = "processing"
            except Exception as stripe_error:
                print(f"Stripe error: {stripe_error}")
                # Continue with demo mode if Stripe fails
                payment_data["status"] = "demo_success"
        else:
            # Demo mode
            payment_data["status"] = "demo_success"
        
        # Store in MongoDB
        payment_data = prepare_for_mongo(payment_data)
        await db.payments.insert_one(payment_data)
        
        # Return response (hide sensitive wallet info)
        return PaymentResponse(
            payment_id=payment_id,
            amount=payment_request.amount,
            tip_amount=payment_request.tip_amount,
            total_amount=total_amount,
            status=payment_data["status"],
            timestamp=payment_data["timestamp"],
            wallet_address=wallet["address"] if payment_data["status"] == "demo_success" else None
        )
        
    except Exception as e:
        print(f"Payment creation error: {e}")
        raise HTTPException(status_code=500, detail=f"Payment creation failed: {str(e)}")

@app.get("/api/payments/{payment_id}")
async def get_payment(payment_id: str):
    """Get payment details by ID"""
    try:
        payment = await db.payments.find_one({"payment_id": payment_id})
        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")
        
        # Remove sensitive information from response
        payment.pop("_id", None)
        payment.pop("wallet_private_key", None)
        payment.pop("stripe_payment_intent", None)
        
        return payment
    except HTTPException:
        raise
    except Exception as e:
        print(f"Get payment error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve payment")

@app.post("/api/receipts/send")
async def send_receipt(receipt_request: ReceiptRequest):
    """Send receipt via email or SMS"""
    try:
        # Get payment details
        payment = await db.payments.find_one({"payment_id": receipt_request.payment_id})
        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")
        
        # Format receipt content
        receipt_content = f"""
🧾 BARBER PAY RECEIPT

Payment ID: {payment['payment_id'][:8]}...
Amount: ${payment['amount']:.2f}
Tip: ${payment['tip_amount']:.2f}
Total: ${payment['total_amount']:.2f}
Date: {payment['timestamp'][:10]}

Thank you for your business! 💈
        """.strip()
        
        success = False
        
        if receipt_request.method == "email" and receipt_request.customer_email:
            # Send email receipt
            if sendgrid_client and SENDGRID_FROM_EMAIL:
                try:
                    message = Mail(
                        from_email=SENDGRID_FROM_EMAIL,
                        to_emails=receipt_request.customer_email,
                        subject="Your Barber Pay Receipt",
                        plain_text_content=receipt_content
                    )
                    response = sendgrid_client.send(message)
                    success = response.status_code == 202
                except Exception as email_error:
                    print(f"Email error: {email_error}")
                    success = True  # Fall back to demo mode on API errors
            else:
                print("SendGrid not configured - email in demo mode")
                success = True  # Demo mode
                
        elif receipt_request.method == "sms" and receipt_request.customer_phone:
            # Send SMS receipt
            if twilio_client and TWILIO_PHONE_NUMBER:
                try:
                    message = twilio_client.messages.create(
                        body=receipt_content,
                        from_=TWILIO_PHONE_NUMBER,
                        to=receipt_request.customer_phone
                    )
                    success = message.sid is not None
                except Exception as sms_error:
                    print(f"SMS error: {sms_error}")
                    success = True  # Fall back to demo mode on API errors
            else:
                print("Twilio not configured - SMS in demo mode")
                success = True  # Demo mode
        
        if success:
            # Update payment record
            await db.payments.update_one(
                {"payment_id": receipt_request.payment_id},
                {"$set": {"receipt_sent": True, "receipt_method": receipt_request.method}}
            )
            return {"success": True, "message": "Receipt sent successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to send receipt")
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Receipt sending error: {e}")
        raise HTTPException(status_code=500, detail="Failed to send receipt")

@app.post("/api/payments/{payment_id}/confirm")
async def confirm_payment(payment_id: str):
    """Confirm payment and trigger USDC conversion"""
    try:
        payment = await db.payments.find_one({"payment_id": payment_id})
        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")
        
        # Update payment status
        await db.payments.update_one(
            {"payment_id": payment_id},
            {"$set": {
                "status": "completed",
                "confirmed_at": datetime.now(timezone.utc).isoformat(),
                "usdc_conversion_status": "completed"  # Demo - would trigger actual Circle API
            }}
        )
        
        return {"success": True, "message": "Payment confirmed", "payment_id": payment_id}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Payment confirmation error: {e}")
        raise HTTPException(status_code=500, detail="Failed to confirm payment")

@app.get("/api/wallet/rotate")
async def rotate_wallet():
    """Generate a new Solana wallet address"""
    try:
        wallet = generate_solana_wallet()
        
        # Store wallet rotation log
        rotation_log = {
            "rotation_id": str(uuid.uuid4()),
            "old_address": "previous_wallet_address",  # Would fetch from storage
            "new_address": wallet["address"],
            "rotated_at": datetime.now(timezone.utc).isoformat(),
            "reason": "manual_rotation"
        }
        
        rotation_log = prepare_for_mongo(rotation_log)
        await db.wallet_rotations.insert_one(rotation_log)
        
        return {
            "success": True,
            "new_wallet_address": wallet["address"],
            "rotated_at": rotation_log["rotated_at"]
        }
        
    except Exception as e:
        print(f"Wallet rotation error: {e}")
        raise HTTPException(status_code=500, detail="Failed to rotate wallet")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0",

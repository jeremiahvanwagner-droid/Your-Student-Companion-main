from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os

router = APIRouter(prefix="/api/store", tags=["Store"])

# Course pack data (matches frontend)
COURSE_PACKS = [
    {
        "id": "nursing",
        "name": "Nursing Pack",
        "description": "Comprehensive nursing terminology, pharmacology, and patient care concepts.",
        "price": 29.99,
        "features": ["500+ Medical Terms", "Drug Interactions", "Care Procedures", "AI Mentor Access"],
        "category": "healthcare"
    },
    {
        "id": "psych101",
        "name": "Psych 101 Pack",
        "description": "Essential psychology concepts, theories, and research methodologies.",
        "price": 24.99,
        "features": ["Key Theories", "Research Methods", "Case Studies", "AI Mentor Access"],
        "category": "social_science"
    },
    {
        "id": "business-law",
        "name": "Business Law Pack",
        "description": "Contract law, corporate regulations, and legal terminology for business.",
        "price": 34.99,
        "features": ["Contract Terms", "Corporate Law", "Case Precedents", "AI Mentor Access"],
        "category": "business"
    },
    {
        "id": "pre-med",
        "name": "Pre-Med Pack",
        "description": "MCAT preparation, anatomy, biochemistry, and medical school essentials.",
        "price": 39.99,
        "features": ["MCAT Prep", "Anatomy Atlas", "Biochemistry", "AI Mentor Access"],
        "category": "healthcare"
    },
    {
        "id": "stem",
        "name": "STEM Foundations Pack",
        "description": "Physics, chemistry, and advanced mathematics for engineering students.",
        "price": 29.99,
        "features": ["Physics Formulas", "Chemistry Concepts", "Calculus", "AI Mentor Access"],
        "category": "stem"
    }
]


class PurchaseRequest(BaseModel):
    pack_id: str
    user_id: Optional[str] = None  # For future user authentication
    payment_token: Optional[str] = None  # For future payment processing


class PurchaseResponse(BaseModel):
    success: bool
    pack_id: str
    message: str
    receipt_id: Optional[str] = None


@router.get("/packs")
async def get_all_packs():
    """
    Get all available course packs.
    """
    return {
        "packs": COURSE_PACKS,
        "total": len(COURSE_PACKS)
    }


@router.get("/packs/{pack_id}")
async def get_pack_details(pack_id: str):
    """
    Get details for a specific course pack.
    """
    pack = next((p for p in COURSE_PACKS if p["id"] == pack_id), None)
    if not pack:
        raise HTTPException(status_code=404, detail="Course pack not found")
    return pack


@router.post("/purchase", response_model=PurchaseResponse)
async def purchase_pack(request: PurchaseRequest):
    """
    Purchase/unlock a course pack.
    
    Currently simulates purchase for demo purposes.
    Will integrate with Stripe or other payment processor.
    """
    # Validate pack exists
    pack = next((p for p in COURSE_PACKS if p["id"] == request.pack_id), None)
    if not pack:
        raise HTTPException(status_code=404, detail="Course pack not found")
    
    # TODO: Integrate with payment processor (Stripe)
    # TODO: Store purchase in database
    # TODO: Link to user account
    
    # Simulate successful purchase
    import uuid
    receipt_id = str(uuid.uuid4())[:8].upper()
    
    return PurchaseResponse(
        success=True,
        pack_id=request.pack_id,
        message=f"Successfully unlocked {pack['name']}!",
        receipt_id=f"RCP-{receipt_id}"
    )


@router.get("/categories")
async def get_categories():
    """
    Get all pack categories.
    """
    categories = list(set(p["category"] for p in COURSE_PACKS))
    return {
        "categories": [
            {"id": cat, "name": cat.replace("_", " ").title()}
            for cat in categories
        ]
    }


@router.get("/featured")
async def get_featured_packs():
    """
    Get featured/popular course packs.
    """
    # Return nursing and pre-med as featured (marked popular in frontend)
    featured = [p for p in COURSE_PACKS if p["id"] in ["nursing", "pre-med"]]
    return {"featured": featured}

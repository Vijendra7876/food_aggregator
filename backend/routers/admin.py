from fastapi import APIRouter, HTTPException, Body
from services.admin_service import get_pipeline_metrics, get_review_queue_data, process_review_decision

router = APIRouter(prefix="/api/admin", tags=["Admin & Data Quality"])

@router.get("/pipeline")
def get_pipeline_status():
    return get_pipeline_metrics()

@router.get("/review-queue")
def get_review_queue():
    queue = get_review_queue_data()
    return {"total": len(queue), "queue": queue}

@router.post("/review-queue/{match_id}/decision")
def post_review_decision(match_id: str, payload: dict = Body(...)):
    decision = payload.get("decision")  # expects "merge" or "keep_separate"
    if decision not in ["merge", "keep_separate"]:
        raise HTTPException(status_code=400, detail="Invalid decision. Must be 'merge' or 'keep_separate'")
    
    return process_review_decision(match_id, decision)
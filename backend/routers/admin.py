import ipaddress

from fastapi import APIRouter, Body, HTTPException, Request

from services.admin_service import (
    demo_admin_enabled,
    get_pipeline_metrics,
    get_review_queue_data,
    process_review_decision,
)

router = APIRouter(prefix="/api/admin", tags=["Admin & Data Quality"])


@router.get("/pipeline")
def get_pipeline_status():
    return get_pipeline_metrics()


@router.get("/review-queue")
def get_review_queue():
    pending = get_review_queue_data()
    return {
        "total": len(pending),
        "pending": pending,
        "demoOnly": True,
        "mutationsEnabled": demo_admin_enabled(),
        "persistence": "CSV benchmark samples; decisions are in-memory only",
    }


@router.post("/review-queue/{match_id}/decision")
def post_review_decision(match_id: str, request: Request, payload: dict = Body(...)):
    client_host = request.client.host if request.client else ""
    try:
        is_loopback = ipaddress.ip_address(client_host).is_loopback
    except ValueError:
        is_loopback = False
    if not demo_admin_enabled() or not is_loopback:
        raise HTTPException(status_code=403, detail="Demo decisions require local-development mode and a loopback connection.")

    decision = payload.get("decision")
    if decision not in {"merge", "keep_separate"}:
        raise HTTPException(status_code=400, detail="Decision must be 'merge' or 'keep_separate'.")

    try:
        return process_review_decision(match_id, decision)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error).strip("'")) from error

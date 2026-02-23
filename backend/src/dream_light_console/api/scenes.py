from fastapi import APIRouter

router = APIRouter()


@router.get("/scenes")
async def list_scenes() -> list:
    return []

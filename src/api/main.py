"""FastAPI hosted-demo entrypoint."""

from __future__ import annotations

from fastapi import FastAPI

from .routes_health import router as health_router
from .routes_legal_query import router as legal_query_router


app = FastAPI(
    title="HK LegalTech Source-Gated RAG Demo",
    version="0.4.0",
    description="Public-demo, source-gated legal research API. private ingestion is disabled by default.",
)

app.include_router(health_router)
app.include_router(legal_query_router)

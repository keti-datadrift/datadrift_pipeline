"""FastAPI application and route registration."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request

from backend.catalog import initialize
from backend.models.endpoints import router as model_endpoints_router
from backend.routes import (
    annotations,
    datasets,
    deletions,
    jobs,
    models,
    reconstructions,
    system,
    workspaces,
)
from backend.routes.reconstructions import reconstruct
from backend.schemas.contracts import Reconstruction


@asynccontextmanager
async def lifespan(app):
    initialize()
    yield


app = FastAPI(
    title="DataDrift · Attribute Extraction",
    version="0.2.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

# Public Python imports for reconstruction clients.
__all__ = ["Reconstruction", "app", "reconstruct"]

for router in (
    model_endpoints_router,
    system.router,
    workspaces.router,
    deletions.router,
    datasets.router,
    annotations.router,
    reconstructions.router,
    models.router,
    jobs.router,
):
    app.include_router(router)


@app.exception_handler(KeyError)
async def missing(request, exc):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(ValueError)
async def invalid(request, exc):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.middleware("http")
async def same_origin(request: Request, call_next):
    origin = request.headers.get("origin")
    # Browser writes require the configured origin; internal CLI calls omit Origin.
    if request.method not in ("GET", "HEAD", "OPTIONS") and origin:
        from urllib.parse import urlsplit

        if origin != os.environ.get("DATADRIFT_PUBLIC_ORIGIN") and urlsplit(
            origin
        ).netloc != request.headers.get("host"):
            from fastapi.responses import JSONResponse

            return JSONResponse(
                status_code=403, content={"detail": "Cross-origin write refused"}
            )
    return await call_next(request)

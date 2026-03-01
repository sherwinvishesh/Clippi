from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import health, clips, chat, audio, jobs
from app.routers.export import router as export_router



app = FastAPI(
    title="Clippi API",
    description="AI-powered video clipping engine",
    version="0.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(clips.router,  prefix="/api")
app.include_router(chat.router,   prefix="/api")
app.include_router(audio.router,  prefix="/api")   # ← add this
app.include_router(jobs.router)
app.include_router(export_router)

@app.get("/")
def root():
    return {"status": "clippi backend running ✅", "version": "0.3.0"}
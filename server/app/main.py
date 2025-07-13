from fastapi import FastAPI
from app.api import company, mapping, extract, review
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(company.router)
app.include_router(mapping.router)
app.include_router(extract.router)
app.include_router(review.router)

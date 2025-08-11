from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.api import company, mapping, review, statements, database_fields, plan_types, table_editor, improve_extraction, pending, dashboard, format_learning, new_extract, summary_rows
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI()

@app.get("/health")
async def health_check():
    """Health check endpoint for Docker and monitoring"""
    return {"status": "healthy", "message": "Commission tracker backend is running"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for PDFs
# Commented out because we're using S3 for PDF storage and this conflicts with the API route
# pdfs_dir = "pdfs"
# if os.path.exists(pdfs_dir):
#     app.mount("/pdfs", StaticFiles(directory=pdfs_dir), name="pdfs")

app.include_router(company.router)
app.include_router(mapping.router)
app.include_router(review.router)
app.include_router(statements.router)
app.include_router(database_fields.router)
app.include_router(plan_types.router)
app.include_router(table_editor.router)
app.include_router(improve_extraction.router)
app.include_router(pending.router)
app.include_router(dashboard.router)
app.include_router(format_learning.router)
app.include_router(new_extract.router)
app.include_router(summary_rows.router)

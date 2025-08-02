from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.api import company, mapping, extract, review, statements, advanced_extract, database_fields, table_editor
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI()

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
app.include_router(extract.router)
app.include_router(advanced_extract.router)
app.include_router(review.router)
app.include_router(statements.router)
app.include_router(database_fields.router)
app.include_router(table_editor.router)

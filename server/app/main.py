# Apply compatibility fixes first
from app.new_extraction_services.utils.compatibility import apply_compatibility_fixes
apply_compatibility_fixes()

from fastapi import FastAPI
from app.api import company, mapping, review, statements, database_fields, plan_types, table_editor, improve_extraction, pending, dashboard, format_learning, new_extract, summary_rows, date_extraction, excel_extract, user_management, admin, otp_auth
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

@app.get("/health")
async def health_check():
    """Health check endpoint for Docker and monitoring"""
    return {"status": "healthy", "message": "Commission tracker backend is running"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(otp_auth.router)
app.include_router(user_management.router)
app.include_router(admin.router)
app.include_router(dashboard.router)
app.include_router(company.router)
app.include_router(mapping.router)
app.include_router(review.router)
app.include_router(statements.router)
app.include_router(database_fields.router)
app.include_router(plan_types.router)
app.include_router(table_editor.router)
app.include_router(improve_extraction.router)
app.include_router(pending.router)
app.include_router(format_learning.router)
app.include_router(new_extract.router)
app.include_router(summary_rows.router)
app.include_router(date_extraction.router)
app.include_router(excel_extract.router)

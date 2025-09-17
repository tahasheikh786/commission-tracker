#!/usr/bin/env python3
"""
Initialize authentication system with admin user and allowed domains.
Run this script after setting up the database to create the initial admin user.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.database import get_sync_db
from app.db.models import User, AllowedDomain, Company
from app.utils.auth_utils import get_password_hash
from sqlalchemy.orm import Session
import uuid

def init_auth_system():
    """Initialize the authentication system with admin user and allowed domain."""
    db = get_sync_db()
    
    try:
        # Check if admin user already exists
        admin_user = db.query(User).filter(User.email == "muhammad@pinecrestconsulting.com").first()
        
        if not admin_user:
            print("Creating admin user...")
            # Create admin user
            admin_user = User(
                email="muhammad@pinecrestconsulting.com",
                role="admin",
                is_active=1,
                is_verified=1,
                first_name="Muhammad",
                last_name="Admin"
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
            print(f"Admin user created with ID: {admin_user.id}")
        else:
            print("Admin user already exists")
        
        # Check if pinecrestconsulting.com domain is allowed
        allowed_domain = db.query(AllowedDomain).filter(
            AllowedDomain.domain == "pinecrestconsulting.com"
        ).first()
        
        if not allowed_domain:
            print("Adding pinecrestconsulting.com to allowed domains...")
            # Create allowed domain
            allowed_domain = AllowedDomain(
                domain="pinecrestconsulting.com",
                is_active=1,
                created_by=admin_user.id
            )
            db.add(allowed_domain)
            db.commit()
            print("Domain added successfully")
        else:
            print("Domain already allowed")
        
        print("Authentication system initialized successfully!")
        print("Admin email: muhammad@pinecrestconsulting.com")
        print("You can now login without a password for the first time.")
        
    except Exception as e:
        print(f"Error initializing auth system: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    init_auth_system()

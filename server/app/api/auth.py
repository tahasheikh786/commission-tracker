from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
from typing import Optional
import uuid

from app.db.database import get_db
from app.db.models import User, AllowedDomain, UserSession
from app.db.auth_schemas import (
    LoginRequest, LoginResponse, UserResponse, UserCreate, 
    AdminSetupRequest, PasswordChangeRequest, DomainManagementRequest,
    UserRoleUpdateRequest, AllowedDomainResponse, SignupRequest,
    CreateUserRequest, UpdateProfileRequest
)
from app.utils.auth_utils import (
    verify_password, get_password_hash, create_access_token, verify_token,
    create_session_token, is_domain_allowed, get_user_by_email, create_user_session,
    get_user_session, invalidate_session, is_admin_user, can_upload_files, can_edit_data
)
from app.services.audit_logging_service import AuditLoggingService

router = APIRouter(prefix="/auth", tags=["authentication"])
security = HTTPBearer()

# Dependency to get current user
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Get current authenticated user."""
    token = credentials.credentials
    token_data = verify_token(token)
    
    user = await get_user_by_email(db, token_data.email)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    if user.is_active == 0:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive"
        )
    
    return user

# Dependency to get admin user
async def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """Get current admin user."""
    if not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user

@router.post("/login", response_model=LoginResponse)
async def login(login_data: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Login endpoint with domain validation."""
    audit_service = AuditLoggingService(db)
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    # Check if domain is allowed
    if not await is_domain_allowed(db, login_data.email):
        # Log failed login attempt
        await audit_service.log_user_authentication(
            user_id=uuid.uuid4(),  # Placeholder for unknown user
            action="login",
            success=False,
            ip_address=client_ip,
            user_agent=user_agent,
            failure_reason="Domain not allowed"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email domain not allowed. Please contact administrator."
        )
    
    # Get user
    user = await get_user_by_email(db, login_data.email)
    
    if user is None:
        # Log failed login attempt
        await audit_service.log_user_authentication(
            user_id=uuid.uuid4(),  # Placeholder for unknown user
            action="login",
            success=False,
            ip_address=client_ip,
            user_agent=user_agent,
            failure_reason="User not found"
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    if user.is_active == 0:
        # Log failed login attempt
        await audit_service.log_user_authentication(
            user_id=user.id,
            action="login",
            success=False,
            ip_address=client_ip,
            user_agent=user_agent,
            failure_reason="Account inactive"
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive"
        )
    
    # Verify password
    if not user.password_hash:
        # Log failed login attempt
        await audit_service.log_user_authentication(
            user_id=user.id,
            action="login",
            success=False,
            ip_address=client_ip,
            user_agent=user_agent,
            failure_reason="Account not configured"
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account not properly configured. Please contact administrator."
        )
    
    if not login_data.password:
        # Log failed login attempt
        await audit_service.log_user_authentication(
            user_id=user.id,
            action="login",
            success=False,
            ip_address=client_ip,
            user_agent=user_agent,
            failure_reason="No password provided"
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Password required"
        )
    
    if not verify_password(login_data.password, user.password_hash):
        # Log failed login attempt
        await audit_service.log_user_authentication(
            user_id=user.id,
            action="login",
            success=False,
            ip_address=client_ip,
            user_agent=user_agent,
            failure_reason="Invalid password"
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Update last login
    user.last_login = datetime.utcnow()
    await db.commit()
    await db.refresh(user)  # Refresh to ensure all attributes are loaded
    
    # Create access token
    access_token_expires = timedelta(minutes=60 * 24)  # 24 hours
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email},
        expires_delta=access_token_expires
    )
    
    # Create session
    session_token = create_session_token()
    await create_user_session(db, str(user.id), session_token)
    
    # Log successful login
    await audit_service.log_user_authentication(
        user_id=user.id,
        action="login",
        success=True,
        ip_address=client_ip,
        user_agent=user_agent,
        session_id=session_token
    )
    
    return LoginResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
        expires_in=60 * 24 * 60  # 24 hours in seconds
    )

@router.post("/signup", response_model=LoginResponse)
async def signup(signup_data: SignupRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Signup endpoint with domain validation."""
    # Check if domain is allowed
    if not await is_domain_allowed(db, signup_data.email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email domain not allowed. Please contact administrator."
        )
    
    # Check if user already exists
    existing_user = await get_user_by_email(db, signup_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists"
        )
    
    # Create new user
    user = User(
        email=signup_data.email,
        password_hash=get_password_hash(signup_data.password),
        first_name=signup_data.first_name,
        last_name=signup_data.last_name,
        role="user",  # Default role
        is_active=1,
        is_verified=0  # Will need admin approval
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # Create access token
    access_token_expires = timedelta(minutes=60 * 24)  # 24 hours
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email},
        expires_delta=access_token_expires
    )
    
    # Create session
    session_token = create_session_token()
    await create_user_session(db, str(user.id), session_token)
    
    return LoginResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
        expires_in=60 * 24 * 60  # 24 hours in seconds
    )

@router.post("/logout")
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
):
    """Logout endpoint."""
    token = credentials.credentials
    await invalidate_session(db, token)
    return {"message": "Successfully logged out"}

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get current user information."""
    # Refresh the user to ensure all attributes are loaded
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)

@router.post("/admin/setup")
async def admin_setup(
    setup_data: AdminSetupRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Setup admin password and profile (first time only)."""
    if current_user.password_hash is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin already set up"
        )
    
    # Update user with password and profile info
    current_user.password_hash = get_password_hash(setup_data.password)
    if setup_data.first_name:
        current_user.first_name = setup_data.first_name
    if setup_data.last_name:
        current_user.last_name = setup_data.last_name
    
    await db.commit()
    return {"message": "Admin setup completed successfully"}

@router.post("/admin/change-password")
async def change_password(
    password_data: PasswordChangeRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Change admin password."""
    if current_user.password_hash and not verify_password(password_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )
    
    current_user.password_hash = get_password_hash(password_data.new_password)
    await db.commit()
    
    return {"message": "Password changed successfully"}

@router.post("/admin/domains", response_model=AllowedDomainResponse)
async def add_allowed_domain(
    domain_data: DomainManagementRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Add a new allowed domain."""
    # Check if domain already exists
    from sqlalchemy import select
    stmt = select(AllowedDomain).filter(
        AllowedDomain.domain == domain_data.domain.lower()
    )
    result = await db.execute(stmt)
    existing_domain = result.scalar_one_or_none()
    
    if existing_domain:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Domain already exists"
        )
    
    # Create new domain
    new_domain = AllowedDomain(
        domain=domain_data.domain.lower(),
        company_id=domain_data.company_id,
        is_active=1 if domain_data.is_active else 0,
        created_by=current_user.id
    )
    
    db.add(new_domain)
    await db.commit()
    await db.refresh(new_domain)
    
    return AllowedDomainResponse.model_validate(new_domain)

@router.get("/admin/domains", response_model=list[AllowedDomainResponse])
async def get_allowed_domains(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all allowed domains."""
    from sqlalchemy import select
    stmt = select(AllowedDomain)
    result = await db.execute(stmt)
    domains = result.scalars().all()
    return [AllowedDomainResponse.model_validate(domain) for domain in domains]

@router.put("/admin/domains/{domain_id}")
async def update_domain(
    domain_id: str,
    domain_data: DomainManagementRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Update domain status."""
    from sqlalchemy import select, update
    stmt = select(AllowedDomain).filter(AllowedDomain.id == domain_id)
    result = await db.execute(stmt)
    domain = result.scalar_one_or_none()
    
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found"
        )
    
    update_stmt = update(AllowedDomain).filter(
        AllowedDomain.id == domain_id
    ).values(
        is_active=1 if domain_data.is_active else 0,
        company_id=domain_data.company_id if domain_data.company_id else domain.company_id
    )
    await db.execute(update_stmt)
    await db.commit()
    return {"message": "Domain updated successfully"}

@router.delete("/admin/domains/{domain_id}")
async def delete_domain(
    domain_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a domain."""
    from sqlalchemy import select, delete
    stmt = select(AllowedDomain).filter(AllowedDomain.id == domain_id)
    result = await db.execute(stmt)
    domain = result.scalar_one_or_none()
    
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found"
        )
    
    delete_stmt = delete(AllowedDomain).filter(AllowedDomain.id == domain_id)
    await db.execute(delete_stmt)
    await db.commit()
    return {"message": "Domain deleted successfully"}

@router.get("/admin/users", response_model=list[UserResponse])
async def get_all_users(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all users (admin only)."""
    from sqlalchemy import select
    stmt = select(User)
    result = await db.execute(stmt)
    users = result.scalars().all()
    # Refresh all users to ensure all attributes are loaded
    for user in users:
        await db.refresh(user)
    return [UserResponse.model_validate(user) for user in users]

@router.put("/admin/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    role_data: UserRoleUpdateRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Update user role and status."""
    from sqlalchemy import select, update
    stmt = select(User).filter(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    update_stmt = update(User).filter(User.id == user_id).values(
        role=role_data.role,
        is_active=1 if role_data.is_active else 0
    )
    await db.execute(update_stmt)
    await db.commit()
    return {"message": "User role updated successfully"}

@router.post("/admin/create-user", response_model=UserResponse)
async def create_user(
    user_data: CreateUserRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new user (admin only)."""
    # Check if domain is allowed
    if not await is_domain_allowed(db, user_data.email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email domain not allowed. Please add the domain first."
        )
    
    # Check if user already exists
    existing_user = await get_user_by_email(db, user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists"
        )
    
    # Create new user with temporary password
    temp_password = "temp123"  # In production, generate a secure temporary password
    user = User(
        email=user_data.email,
        password_hash=get_password_hash(temp_password),
        first_name=None,  # User will set this themselves
        last_name=None,   # User will set this themselves
        role=user_data.role,
        is_active=1,
        is_verified=0  # Will need to set password on first login
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    return UserResponse.model_validate(user)

@router.put("/admin/update-profile")
async def update_profile(
    profile_data: UpdateProfileRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Update admin profile information."""
    current_user.first_name = profile_data.first_name
    current_user.last_name = profile_data.last_name
    
    await db.commit()
    await db.refresh(current_user)
    
    return {"message": "Profile updated successfully"}

@router.get("/permissions")
async def get_user_permissions(current_user: User = Depends(get_current_user)):
    """Get user permissions."""
    return {
        "can_upload": can_upload_files(current_user),
        "can_edit": can_edit_data(current_user),
        "is_admin": is_admin_user(current_user),
        "is_read_only": current_user.role == "read_only"
    }

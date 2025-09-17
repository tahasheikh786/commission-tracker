from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from uuid import UUID

# User schemas
class UserBase(BaseModel):
    email: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: str = "user"

class UserCreate(UserBase):
    password: Optional[str] = None

class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

class UserResponse(UserBase):
    id: UUID
    is_active: bool
    is_verified: bool
    company_id: Optional[UUID]
    last_login: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Authentication schemas
class LoginRequest(BaseModel):
    email: EmailStr
    password: Optional[str] = None

class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    expires_in: int

class TokenData(BaseModel):
    user_id: Optional[UUID] = None
    email: Optional[str] = None

# Domain management schemas
class AllowedDomainBase(BaseModel):
    domain: str
    company_id: Optional[UUID] = None

class AllowedDomainCreate(AllowedDomainBase):
    pass

class AllowedDomainResponse(AllowedDomainBase):
    id: UUID
    is_active: bool
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Admin management schemas
class AdminSetupRequest(BaseModel):
    password: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

class DomainManagementRequest(BaseModel):
    domain: str
    is_active: bool = True
    company_id: Optional[UUID] = None

class UserRoleUpdateRequest(BaseModel):
    user_id: UUID
    role: str
    is_active: bool = True

class CreateUserRequest(BaseModel):
    email: EmailStr
    role: str = "user"

class UpdateProfileRequest(BaseModel):
    first_name: str
    last_name: str

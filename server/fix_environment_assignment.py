"""
Fix Environment Assignment - Assign statements and commissions to default environment
"""
import asyncio
import sys
import os
from sqlalchemy import select, and_, update
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Add server directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.db.models import StatementUpload, EarnedCommission, Environment, User
from dotenv import load_dotenv

load_dotenv()

# Get database URL
RENDER_DB_URL = os.environ.get("RENDER_DB_KEY")
SUPABASE_DB_URL = os.environ.get("SUPABASE_DB_KEY")

if RENDER_DB_URL:
    if not RENDER_DB_URL.startswith("postgresql+asyncpg://"):
        DATABASE_URL = RENDER_DB_URL.replace("postgresql://", "postgresql+asyncpg://")
    else:
        DATABASE_URL = RENDER_DB_URL
elif SUPABASE_DB_URL:
    if not SUPABASE_DB_URL.startswith("postgresql+asyncpg://"):
        DATABASE_URL = SUPABASE_DB_URL.replace("postgresql://", "postgresql+asyncpg://")
    else:
        DATABASE_URL = SUPABASE_DB_URL
else:
    raise ValueError("No database URL configured!")

# Create async engine
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def fix_environment_assignment():
    """Assign statements and commissions to the user's default environment"""
    print("\n" + "="*80)
    print("🔧 Fixing Environment Assignment")
    print("="*80 + "\n")
    
    async with AsyncSessionLocal() as session:
        try:
            # Step 1: Find statements without environment_id
            print("📋 Step 1: Finding statements without environment...")
            result = await session.execute(
                select(StatementUpload).where(
                    StatementUpload.environment_id.is_(None)
                )
            )
            statements_without_env = result.scalars().all()
            print(f"   Found {len(statements_without_env)} statements without environment\n")
            
            if len(statements_without_env) == 0:
                print("✅ All statements have environments assigned!")
                return
            
            # Step 2: For each statement, find or use the user's default environment
            print("🔧 Step 2: Assigning statements to environments...")
            fixed_statements = 0
            
            for stmt in statements_without_env:
                print(f"\n   Processing statement: {stmt.file_name}")
                print(f"   - Statement ID: {stmt.id}")
                print(f"   - User ID: {stmt.user_id}")
                print(f"   - Company ID: {stmt.company_id}")
                
                # Get the user
                user_result = await session.execute(
                    select(User).where(User.id == stmt.user_id)
                )
                user = user_result.scalar_one_or_none()
                
                if not user:
                    print(f"   ⚠️  User not found, skipping...")
                    continue
                
                print(f"   - User: {user.email}")
                print(f"   - User's Company ID: {user.company_id}")
                
                # Find the user's default environment
                env_result = await session.execute(
                    select(Environment).where(
                        and_(
                            Environment.created_by == stmt.user_id,
                            Environment.name == 'Default'
                        )
                    ).limit(1)
                )
                default_env = env_result.scalar_one_or_none()
                
                if default_env:
                    print(f"   ✅ Found default environment: {default_env.id}")
                    
                    # Update the statement
                    stmt.environment_id = default_env.id
                    print(f"   ✅ Assigned statement to environment")
                    
                    # Update any commission records for this user without environment
                    comm_result = await session.execute(
                        select(EarnedCommission).where(
                            and_(
                                EarnedCommission.user_id == stmt.user_id,
                                EarnedCommission.environment_id.is_(None)
                            )
                        )
                    )
                    commissions = comm_result.scalars().all()
                    
                    for comm in commissions:
                        comm.environment_id = default_env.id
                        print(f"   ✅ Assigned commission {comm.id} ({comm.client_name}) to environment")
                    
                    fixed_statements += 1
                else:
                    print(f"   ⚠️  No default environment found for this user")
                    print(f"   Creating default environment...")
                    
                    # Create default environment for the user
                    new_env = Environment(
                        name='Default',
                        company_id=user.company_id,
                        created_by=user.id
                    )
                    session.add(new_env)
                    await session.flush()  # Get the ID
                    
                    print(f"   ✅ Created default environment: {new_env.id}")
                    
                    # Update the statement
                    stmt.environment_id = new_env.id
                    print(f"   ✅ Assigned statement to new environment")
                    
                    # Update any commission records for this user without environment
                    comm_result = await session.execute(
                        select(EarnedCommission).where(
                            and_(
                                EarnedCommission.user_id == stmt.user_id,
                                EarnedCommission.environment_id.is_(None)
                            )
                        )
                    )
                    commissions = comm_result.scalars().all()
                    
                    for comm in commissions:
                        comm.environment_id = new_env.id
                        print(f"   ✅ Assigned commission {comm.id} ({comm.client_name}) to new environment")
                    
                    fixed_statements += 1
            
            # Commit all changes
            print(f"\n💾 Committing changes to database...")
            await session.commit()
            print(f"   ✅ Changes committed successfully")
            
            # Verify
            print(f"\n🔍 Verification:")
            result = await session.execute(
                select(StatementUpload).where(
                    StatementUpload.environment_id.is_(None)
                )
            )
            remaining = result.scalars().all()
            print(f"   Statements without environment: {len(remaining)}")
            
            result = await session.execute(
                select(EarnedCommission).where(
                    EarnedCommission.environment_id.is_(None)
                )
            )
            remaining_comm = result.scalars().all()
            print(f"   Commissions without environment: {len(remaining_comm)}")
            
            # Final summary
            print("\n" + "="*80)
            print("📊 FIX SUMMARY")
            print("="*80)
            print(f"Statements fixed: {fixed_statements}")
            print(f"Remaining issues: {len(remaining) + len(remaining_comm)}")
            print("="*80 + "\n")
            
            if fixed_statements > 0:
                print("🎉 Environment assignment completed!")
                print("   However, data is still isolated per user.")
                print("   Each user only sees THEIR OWN data by default.")
                print("\n   To see all company data:")
                print("   1. Make sure you're logged in as the user who uploaded the data")
                print("   2. OR use the 'All Data' toggle in the UI")
                print("   3. OR make the user an admin to see all data\n")
            
        except Exception as e:
            print(f"\n❌ Fatal error: {str(e)}")
            import traceback
            traceback.print_exc()
            await session.rollback()
            raise


if __name__ == "__main__":
    try:
        asyncio.run(fix_environment_assignment())
    except KeyboardInterrupt:
        print("\n⚠️  Fix cancelled by user")
    except Exception as e:
        print(f"\n❌ Fix failed: {str(e)}")
        sys.exit(1)


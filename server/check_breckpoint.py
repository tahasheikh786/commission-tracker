import asyncio
import sys
import os

# Change to server directory
os.chdir(os.path.join(os.path.dirname(__file__), 'server'))
sys.path.insert(0, os.getcwd())

async def check_db():
    from app.db.session import async_session_maker
    from sqlalchemy import text
    
    async with async_session_maker() as session:
        # Get Breckpoint carrier ID first
        query = text("""
            SELECT id, name FROM companies WHERE name ILIKE '%breckpoint%';
        """)
        result = await session.execute(query)
        carrier = result.fetchone()
        
        if not carrier:
            print('No carrier found matching Breckpoint')
            return
            
        carrier_id = carrier[0]
        print(f'Found carrier: {carrier[1]} (ID: {carrier_id})')
        print()
        
        # Get all earned commission records for this carrier
        query2 = text("""
            SELECT 
                ec.id,
                ec.client_name,
                ec.commission_earned,
                ec.invoice_total,
                ec.statement_year,
                ec.statement_month,
                array_length(ec.upload_ids, 1) as upload_count,
                ec.upload_ids
            FROM earned_commission ec
            WHERE ec.carrier_id = :carrier_id
            ORDER BY ec.statement_year DESC NULLS LAST, ec.statement_month DESC NULLS LAST, ec.created_at DESC;
        """)
        result2 = await session.execute(query2, {'carrier_id': carrier_id})
        rows = result2.fetchall()
        
        print(f'=== EARNED COMMISSION RECORDS ({len(rows)}) ===')
        total_commission = 0
        total_invoice = 0
        for row in rows:
            print(f'ID: {row[0]}, Client: {row[1]}')
            print(f'  Commission: ${row[2]}, Invoice: ${row[3]}')
            print(f'  Year: {row[4]}, Month: {row[5]}, Upload count: {row[6]}')
            print(f'  Upload IDs: {row[7]}')
            print()
            if row[7]:  # If upload_ids is not None
                total_commission += float(row[2] or 0)
                total_invoice += float(row[3] or 0)
        
        print(f'=== TOTALS ===')
        print(f'Total Commission: ${total_commission:.2f}')
        print(f'Total Invoice: ${total_invoice:.2f}')
        print()
        
        # Check statements
        query3 = text("""
            SELECT 
                su.id,
                su.filename,
                su.status,
                su.statement_date,
                COUNT(DISTINCT ec.id) as commission_record_count
            FROM statement_uploads su
            LEFT JOIN earned_commission ec ON ec.upload_ids @> ARRAY[su.id]
            WHERE su.carrier_id = :carrier_id OR su.company_id = :carrier_id
            GROUP BY su.id, su.filename, su.status, su.statement_date
            ORDER BY su.statement_date DESC NULLS LAST, su.created_at DESC;
        """)
        result3 = await session.execute(query3, {'carrier_id': carrier_id})
        statements = result3.fetchall()
        
        print(f'=== STATEMENTS ({len(statements)}) ===')
        for stmt in statements:
            print(f'ID: {stmt[0]}, Filename: {stmt[1]}, Status: {stmt[2]}, Date: {stmt[3]}, Commission Records: {stmt[4]}')

if __name__ == '__main__':
    asyncio.run(check_db())


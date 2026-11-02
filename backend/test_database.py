
from sqlalchemy import text
from app.core.database import engine

try:
    with engine.connect() as connection:
        result = connection.execute(
            text("SELECT current_database()")
        )

        print("PostgreSQL connected successfully!")
        print("Database:", result.scalar())

except Exception as error:
    print("Database connection failed:", error)

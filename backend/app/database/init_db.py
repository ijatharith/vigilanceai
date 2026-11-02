from app.database.connection import engine, Base
from app.database import models


def initialize_database():

    Base.metadata.create_all(bind=engine)

    print("Vigil database tables initialized")


if __name__ == "__main__":
    initialize_database()
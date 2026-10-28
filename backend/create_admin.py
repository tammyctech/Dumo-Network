import getpass

from sqlalchemy import select

from app.database import SessionLocal
from app.models import User


def create_admin():

    print("\n====================================")
    print("DUMO NETWORK - ADMIN SETUP")
    print("====================================\n")

    email = input(
        "Enter the email of your existing account: "
    ).strip().lower()

    if not email:
        print("Email cannot be empty.")
        return

    db = SessionLocal()

    try:

        user = db.scalar(
            select(User).where(User.email == email)
        )

        if user is None:
            print("\nAccount not found.")
            print("Please register the account first.")
            return

        print("\nAccount found!")
        print(f"Name: {user.full_name}")
        print(f"Email: {user.email}")
        print(f"Current Role: {user.role}")

        if not user.is_active:
            print("\nThis account is inactive.")
            print("Activate it through an approved process first.")
            return

        if user.role == "admin":
            print("\nThis account is already an administrator.")
            return

        confirmation = input(
            "\nType PROMOTE to make this user an admin: "
        ).strip()

        if confirmation != "PROMOTE":
            print("\nOperation cancelled.")
            return

        user.role = "admin"

        db.commit()

        print("\n====================================")
        print("ADMINISTRATOR CREATED SUCCESSFULLY")
        print("====================================")

        print(f"Name: {user.full_name}")
        print(f"Email: {user.email}")
        print(f"New Role: {user.role}")

    except Exception as error:

        db.rollback()

        print("\nAn error occurred:")
        print(error)

    finally:

        db.close()


if __name__ == "__main__":
    create_admin()

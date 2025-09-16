import sys
import os
from uuid import uuid4

# Add project root and podcast-pro-plus to the Python path
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.append(project_root)
sys.path.append(os.path.join(project_root, 'podcast-pro-plus'))

from api.core.database import get_session
from api.core.security import get_password_hash
from api.models.user import User
from api.models.podcast import Podcast, Episode

def seed_database():
    """Seeds the database with a test user, podcast, and episode."""
    db_session = next(get_session())

    try:
        # Create a test user
        test_user = db_session.query(User).filter(User.email == "test@example.com").first()
        if not test_user:
            test_user = User(
                email="test@example.com",
                hashed_password=get_password_hash("password"),
                is_active=True,
                tier="free",
            )
            db_session.add(test_user)
            db_session.commit()
            db_session.refresh(test_user)
            print("Created test user: test@example.com")

        # Create a test podcast
        test_podcast = db_session.query(Podcast).filter(Podcast.name == "My Test Podcast").first()
        if not test_podcast:
            test_podcast = Podcast(
                name="My Test Podcast",
                description="A podcast for testing.",
                user_id=test_user.id,
            )
            db_session.add(test_podcast)
            db_session.commit()
            db_session.refresh(test_podcast)
            print("Created test podcast: My Test Podcast")

        # Create a test episode
        test_episode = db_session.query(Episode).filter(Episode.title == "My Test Episode").first()
        if not test_episode:
            test_episode = Episode(
                title="My Test Episode",
                show_notes="Show notes for the test episode.",
                user_id=test_user.id,
                podcast_id=test_podcast.id,
            )
            db_session.add(test_episode)
            db_session.commit()
            db_session.refresh(test_episode)
            print("Created test episode: My Test Episode")

    finally:
        db_session.close()

if __name__ == "__main__":
    seed_database()
from motor.motor_asyncio import AsyncIOMotorClient

from core.config import settings


client = AsyncIOMotorClient(settings.MONGODB_URL)
db = client[settings.DATABASE_NAME]

interview_configs_collection = db["interview_configs"]
sessions_collection = db["sessions"]
questions_collection = db["questions"]


async def connect_to_mongo() -> None:
    await client.admin.command("ping")
    print("MongoDB connected")


async def close_mongo_connection() -> None:
    client.close()

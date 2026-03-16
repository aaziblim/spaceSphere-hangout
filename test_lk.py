import asyncio
from livekit.api import LiveKitAPI
from livekit.protocol.room import UpdateParticipantRequest
from livekit.protocol.models import ParticipantPermission

async def main():
    api = LiveKitAPI("http://localhost:7880", "devkey", "secret")
    print("API instantiated")
    
    req = UpdateParticipantRequest(
        room='test',
        identity='1',
        permission=ParticipantPermission(can_publish=True, can_subscribe=True)
    )
    
    try:
        await api.room.update_participant(req)
        print("Success")
    except Exception as e:
        print("Error:", e)
    finally:
        await api.aclose()

asyncio.run(main())

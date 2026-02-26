from celery import shared_task
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image
from io import BytesIO

from .models import Post


@shared_task
def process_post_media_task(post_id: int) -> None:
    try:
        post = Post.objects.get(id=post_id)
    except Post.DoesNotExist:
        return

    if post.post_image:
        try:
            with default_storage.open(post.post_image.name, 'rb') as f:
                image = Image.open(f)
                image = image.convert('RGB')
                image.thumbnail((2000, 2000))
                buffer = BytesIO()
                image.save(buffer, format='JPEG', optimize=True, quality=85)
                buffer.seek(0)

                original_name = post.post_image.name
                post.post_image.save(original_name, ContentFile(buffer.read()), save=True)
        except Exception:
            return


@shared_task
def track_post_view_task(post_id: int) -> None:
    key = f"analytics:post_views:{post_id}"
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=86400)

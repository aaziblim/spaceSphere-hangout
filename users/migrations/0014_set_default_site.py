from django.db import migrations
import os


def set_default_site(apps, schema_editor):
    Site = apps.get_model("sites", "Site")
    Site.objects.update_or_create(
        id=1,
        defaults={
            "domain": os.environ.get("SITE_DOMAIN", "my-project-latest.onrender.com"),
            "name": os.environ.get("SITE_NAME", "Spherespace"),
        },
    )


def unset_default_site(apps, schema_editor):
    Site = apps.get_model("sites", "Site")
    Site.objects.filter(id=1).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("sites", "0002_alter_domain_unique"),
        ("users", "0013_userachievement"),
    ]

    operations = [
        migrations.RunPython(set_default_site, unset_default_site),
    ]

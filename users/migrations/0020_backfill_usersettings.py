from django.db import migrations


def create_settings_for_existing_users(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    UserSettings = apps.get_model('users', 'UserSettings')
    for user in User.objects.all():
        UserSettings.objects.get_or_create(user=user)


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0019_usersettings'),
    ]

    operations = [
        migrations.RunPython(
            create_settings_for_existing_users,
            migrations.RunPython.noop,
        ),
    ]

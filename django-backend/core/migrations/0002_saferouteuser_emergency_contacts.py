from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='saferouteuser',
            name='emergency_contacts',
            field=models.JSONField(default=list, blank=True),
        ),
    ]

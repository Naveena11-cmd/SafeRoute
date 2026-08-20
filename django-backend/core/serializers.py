from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework.validators import UniqueValidator
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Incident, SavedRoute

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    # BUG FIX: Django's base User/AbstractUser email field is NOT unique by
    # default, and this serializer previously had no uniqueness check of its
    # own. That let two accounts register with the same email; the first
    # login attempt afterwards then crashed with a 500
    # (MultipleObjectsReturned) inside EmailTokenObtainPairSerializer below.
    # Enforce uniqueness here instead, so a duplicate signup gets a clean
    # 400 "already registered" error.
    email = serializers.EmailField(
        validators=[UniqueValidator(queryset=User.objects.all(), message="An account with that email already exists.")]
    )

    class Meta:
        model = User
        fields = ["id", "username", "email", "full_name", "password"]

    def create(self, validated_data):
        user = User(
            username=validated_data["username"],
            email=validated_data["email"],
            full_name=validated_data.get("full_name", ""),
        )
        user.set_password(validated_data["password"])
        user.save()
        return user


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Django's User model authenticates by `username`, but the SafeRoute UI
    only ever collects an email address (matching the video's login form
    and saferoute-app.html). This adds an `email` input field, looks up
    the matching username, and delegates to the parent serializer with
    that username — so Django's authenticate(username=..., password=...)
    still gets called the way it expects under the hood.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["email"] = serializers.EmailField(write_only=True)
        # The parent class auto-adds a `username` field based on
        # User.USERNAME_FIELD; make it optional since we collect email instead.
        self.fields[self.username_field].required = False
        self.fields[self.username_field].allow_blank = True

    def validate(self, attrs):
        email = attrs.get("email")
        if not email:
            raise serializers.ValidationError({"email": "This field is required."})
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise serializers.ValidationError("No account found for that email.")
        attrs[self.username_field] = user.username
        return super().validate(attrs)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "full_name"]


class UpdateUsernameSerializer(serializers.ModelSerializer):
    """Details page allows updating the username only — email and password
    are left alone. Login still works afterwards because it's keyed off
    email, not username (see EmailTokenObtainPairSerializer)."""

    username = serializers.CharField(
        min_length=3, max_length=150,
        validators=[UniqueValidator(queryset=User.objects.all(), message="That username is already taken.")],
    )

    class Meta:
        model = User
        fields = ["username"]


class IncidentSerializer(serializers.ModelSerializer):
    reported_by_name = serializers.CharField(source="reported_by.full_name", read_only=True)

    class Meta:
        model = Incident
        fields = [
            "id", "incident_type", "severity", "location_label", "lat", "lon",
            "description", "source", "reported_by", "reported_by_name", "created_at",
        ]
        read_only_fields = ["reported_by", "source", "created_at"]


class SavedRouteSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedRoute
        fields = [
            "id", "source_label", "source_lat", "source_lon",
            "destination_label", "destination_lat", "destination_lon",
            "distance_km", "duration_min", "overall_safety_score", "risk_level",
            "geometry", "created_at",
        ]
        read_only_fields = ["created_at"]

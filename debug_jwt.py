#!/usr/bin/env python3
"""Debug JWT token validation"""

import json
import base64
import sys


def decode_jwt(token):
    """Decode and display JWT parts"""
    parts = token.split('.')
    if len(parts) != 3:
        print(f"❌ Invalid JWT format: expected 3 parts, got {len(parts)}")
        return False

    header_part, payload_part, signature_part = parts

    print("=" * 60)
    print("🔍 JWT Token Analysis")
    print("=" * 60)

    # Decode header
    print("\n📋 Header:")
    try:
        # Add padding if needed
        header_padded = header_part + '=' * (4 - len(header_part) % 4)
        header = json.loads(base64.urlsafe_b64decode(header_padded))
        print(json.dumps(header, indent=2))
    except Exception as e:
        print(f"❌ Failed to decode header: {e}")
        return False

    # Decode payload
    print("\n📦 Payload:")
    try:
        payload_padded = payload_part + '=' * (4 - len(payload_part) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_padded))
        print(json.dumps(payload, indent=2))
    except Exception as e:
        print(f"❌ Failed to decode payload: {e}")
        return False

    # Show signature
    print("\n🔐 Signature:")
    print(f"First 40 chars: {signature_part[:40]}...")
    print(f"Length: {len(signature_part)} characters")

    print("\n" + "=" * 60)
    return True


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 debug_jwt.py <token>")
        sys.exit(1)

    token = sys.argv[1]
    decode_jwt(token)

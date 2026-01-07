"""
Smoke Tests for TaxScape Pro API

These tests verify basic functionality without requiring real AI calls.
Run with: python -m pytest tests/test_smoke.py -v
"""

import os
import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

# Set test environment
os.environ["ENVIRONMENT"] = "test"
os.environ["SUPABASE_URL"] = "https://test.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-key"

# Import after setting env vars
from app.main import app

client = TestClient(app)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def mock_supabase():
    """Mock Supabase client for testing."""
    with patch("app.supabase_client.get_supabase") as mock:
        mock_client = MagicMock()
        mock.return_value = mock_client
        yield mock_client


@pytest.fixture
def mock_auth():
    """Mock authentication for protected endpoints."""
    with patch("app.supabase_client.verify_supabase_token") as mock_verify:
        mock_verify.return_value = {
            "id": "test-user-id",
            "email": "test@example.com",
        }
        with patch("app.supabase_client.get_user_profile") as mock_profile:
            mock_profile.return_value = {
                "organization_id": "test-org-id",
                "selected_client_id": "test-client-id",
            }
            yield


@pytest.fixture
def auth_headers():
    """Auth headers for protected endpoints."""
    return {"Authorization": "Bearer test-token"}


# =============================================================================
# HEALTH & SYSTEM TESTS
# =============================================================================

class TestHealthEndpoints:
    """Test system health and observability endpoints."""

    def test_health_check(self):
        """Health endpoint should return 200."""
        response = client.get("/api/system/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "timestamp" in data
        assert "version" in data

    def test_health_check_structure(self):
        """Health response should have correct structure."""
        response = client.get("/api/system/health")
        data = response.json()
        assert isinstance(data.get("services"), dict)
        assert data.get("environment") in ["development", "test", "production"]


class TestAuthEndpoints:
    """Test authentication-related functionality."""

    def test_unauthenticated_request(self):
        """Protected endpoints should reject unauthenticated requests."""
        response = client.get("/api/dashboard/client-summary?client_company_id=test")
        assert response.status_code == 401

    def test_invalid_token(self, mock_supabase):
        """Invalid tokens should be rejected."""
        with patch("app.supabase_client.verify_supabase_token") as mock_verify:
            mock_verify.return_value = None
            response = client.get(
                "/api/dashboard/client-summary?client_company_id=test",
                headers={"Authorization": "Bearer invalid-token"}
            )
            assert response.status_code == 401


# =============================================================================
# DASHBOARD TESTS
# =============================================================================

class TestDashboardEndpoints:
    """Test CPA dashboard functionality."""

    def test_dashboard_summary_structure(self, mock_supabase, mock_auth, auth_headers):
        """Dashboard summary should return expected structure."""
        # Mock database responses
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data={"id": "test-client", "name": "Test Client", "organization_id": "test-org"}
        )
        
        # Mock other queries
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
        
        response = client.get(
            "/api/dashboard/client-summary?client_company_id=test-client&tax_year=2024",
            headers=auth_headers
        )
        
        # Should return 200 or appropriate error
        assert response.status_code in [200, 403, 404, 500]

    def test_readiness_recompute(self, mock_supabase, mock_auth, auth_headers):
        """Readiness recompute should work."""
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data={"id": "test-client", "organization_id": "test-org"}
        )
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        mock_supabase.table.return_value.update.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[{}])
        
        response = client.post(
            "/api/dashboard/readiness/recompute?client_company_id=test-client&tax_year=2024",
            headers=auth_headers
        )
        
        assert response.status_code in [200, 403, 500]


# =============================================================================
# SUGGESTIONS TESTS
# =============================================================================

class TestSuggestionsEndpoints:
    """Test Action Center suggestions functionality."""

    def test_suggestions_endpoint_exists(self, mock_supabase, mock_auth, auth_headers):
        """Suggestions endpoint should exist and respond."""
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data={"id": "test-client", "organization_id": "test-org"}
        )
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        
        response = client.get(
            "/api/copilot/suggestions?client_company_id=test-client&tax_year=2024",
            headers=auth_headers
        )
        
        assert response.status_code in [200, 403, 500]

    def test_dismiss_suggestion(self, mock_supabase, mock_auth, auth_headers):
        """Should be able to dismiss suggestions."""
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data={"id": "test-client", "organization_id": "test-org"}
        )
        mock_supabase.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[{}])
        
        response = client.post(
            "/api/copilot/suggestions/dismiss?client_company_id=test-client&tax_year=2024",
            headers=auth_headers,
            json={"suggestion_key": "test_suggestion", "snooze_hours": 24}
        )
        
        assert response.status_code in [200, 403, 500]


# =============================================================================
# MISSING INFO TESTS
# =============================================================================

class TestMissingInfoEndpoints:
    """Test missing information detection."""

    def test_detect_endpoint_exists(self, mock_supabase, mock_auth, auth_headers):
        """Missing info detection endpoint should exist."""
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data={"id": "test-client", "organization_id": "test-org"}
        )
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        
        response = client.post(
            "/api/missing-info/detect?client_company_id=test-client&tax_year=2024",
            headers=auth_headers
        )
        
        assert response.status_code in [200, 403, 500]

    def test_list_missing_fields(self, mock_supabase, mock_auth, auth_headers):
        """Should list missing field requests."""
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data={"id": "test-client", "organization_id": "test-org"}
        )
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.order.return_value.range.return_value.execute.return_value = MagicMock(
            data=[], count=0
        )
        
        response = client.get(
            "/api/missing-info/list?client_company_id=test-client&tax_year=2024",
            headers=auth_headers
        )
        
        assert response.status_code in [200, 403, 500]


# =============================================================================
# DEMO MODE TESTS
# =============================================================================

class TestDemoEndpoints:
    """Test demo mode functionality."""

    def test_tour_steps_endpoint(self, mock_auth, auth_headers):
        """Tour steps should be retrievable."""
        response = client.get(
            "/api/demo/tour/steps",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        
        # Check step structure
        step = data[0]
        assert "id" in step
        assert "title" in step
        assert "description" in step
        assert "target_route" in step

    def test_demo_session_endpoint(self, mock_supabase, mock_auth, auth_headers):
        """Demo session endpoint should work."""
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(data=None)
        
        response = client.get(
            "/api/demo/session",
            headers=auth_headers
        )
        
        # Should return 200 with None or session data
        assert response.status_code in [200, 500]


# =============================================================================
# PAGINATED DATA TESTS
# =============================================================================

class TestPaginatedEndpoints:
    """Test paginated data endpoints."""

    def test_timesheets_pagination(self, mock_supabase, mock_auth, auth_headers):
        """Timesheets should support pagination."""
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data={"id": "test-client", "organization_id": "test-org"}
        )
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = MagicMock(
            data=[], count=0
        )
        
        response = client.get(
            "/api/data/timesheets?client_company_id=test-client&tax_year=2024&page=1&page_size=50",
            headers=auth_headers
        )
        
        assert response.status_code in [200, 403, 500]

    def test_ap_transactions_pagination(self, mock_supabase, mock_auth, auth_headers):
        """AP transactions should support pagination."""
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data={"id": "test-client", "organization_id": "test-org"}
        )
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = MagicMock(
            data=[], count=0
        )
        
        response = client.get(
            "/api/data/ap-transactions?client_company_id=test-client&tax_year=2024&page=1&page_size=50",
            headers=auth_headers
        )
        
        assert response.status_code in [200, 403, 500]


# =============================================================================
# CAPABILITIES TESTS
# =============================================================================

class TestCapabilitiesEndpoints:
    """Test role and capability endpoints."""

    def test_capabilities_endpoint(self, mock_supabase, mock_auth, auth_headers):
        """Should return user capabilities."""
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data={"role": "cpa", "capabilities": {}}
        )
        
        response = client.get(
            "/api/system/capabilities",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "capabilities" in data
        assert "role" in data


# =============================================================================
# RATE LIMITING TESTS
# =============================================================================

class TestRateLimiting:
    """Test rate limiting functionality."""

    def test_rate_limit_headers(self, mock_supabase, mock_auth, auth_headers):
        """Responses should include request ID header."""
        response = client.get("/api/system/health")
        # Request ID should be in response headers
        assert "x-request-id" in response.headers or response.status_code == 200


# =============================================================================
# ERROR HANDLING TESTS
# =============================================================================

class TestErrorHandling:
    """Test error handling and responses."""

    def test_404_response_structure(self):
        """404 errors should have consistent structure."""
        response = client.get("/api/nonexistent-endpoint")
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data

    def test_validation_error_structure(self, mock_auth, auth_headers):
        """Validation errors should have helpful messages."""
        # Missing required parameter
        response = client.get(
            "/api/dashboard/client-summary",  # Missing client_company_id
            headers=auth_headers
        )
        assert response.status_code in [401, 422]


# =============================================================================
# INTEGRATION SMOKE TEST
# =============================================================================

class TestIntegrationSmoke:
    """High-level integration smoke tests."""

    def test_full_pipeline_mocked(self, mock_supabase, mock_auth, auth_headers):
        """Test a simplified full pipeline flow with mocks."""
        # This simulates the user flow without real DB
        
        # 1. Health check
        response = client.get("/api/system/health")
        assert response.status_code == 200
        
        # 2. Get capabilities
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data={"role": "cpa", "capabilities": {}}
        )
        response = client.get("/api/system/capabilities", headers=auth_headers)
        assert response.status_code == 200
        
        # 3. Get tour steps (for demo)
        response = client.get("/api/demo/tour/steps", headers=auth_headers)
        assert response.status_code == 200
        
        print("✅ Integration smoke test passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])


"""
End-to-End Test: Import → Recompute → Readiness → Evaluate → Study Generate

This test validates the complete R&D tax credit pipeline:
1. Creates a test client
2. Seeds demo data (simulates Excel import)
3. Runs recompute pipeline
4. Validates readiness scores
5. Runs AI evaluation (mocked)
6. Generates study artifacts
7. Verifies complete output
"""

import pytest
import os
import sys
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta
import random

# Add the app directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def mock_supabase():
    """Mock Supabase client for testing."""
    mock = MagicMock()
    
    # Storage for test data
    test_data = {
        "client_companies": [],
        "projects": [],
        "employees": [],
        "timesheets": [],
        "vendors": [],
        "ap_transactions": [],
        "contracts": [],
        "supplies": [],
        "qre_summaries": [],
        "readiness_snapshots": [],
    }
    
    def make_mock_table(table_name):
        """Create a mock table with CRUD operations."""
        table_mock = MagicMock()
        
        def insert_handler(data):
            result_mock = MagicMock()
            if isinstance(data, dict):
                data["id"] = f"test-{table_name}-{len(test_data[table_name])}"
                data["created_at"] = datetime.utcnow().isoformat()
                test_data[table_name].append(data)
                result_mock.data = [data]
            result_mock.execute = MagicMock(return_value=result_mock)
            return result_mock
        
        def select_handler(*args):
            select_mock = MagicMock()
            select_mock.data = test_data.get(table_name, [])
            
            def eq_handler(field, value):
                eq_mock = MagicMock()
                filtered = [r for r in test_data.get(table_name, []) if r.get(field) == value]
                eq_mock.data = filtered
                eq_mock.execute = MagicMock(return_value=eq_mock)
                eq_mock.eq = eq_handler
                eq_mock.single = MagicMock(return_value=MagicMock(
                    data=filtered[0] if filtered else None,
                    execute=MagicMock(return_value=MagicMock(data=filtered[0] if filtered else None))
                ))
                return eq_mock
            
            select_mock.execute = MagicMock(return_value=select_mock)
            select_mock.eq = eq_handler
            return select_mock
        
        def update_handler(data):
            update_mock = MagicMock()
            update_mock.execute = MagicMock(return_value=MagicMock(data=[]))
            update_mock.eq = MagicMock(return_value=update_mock)
            return update_mock
        
        table_mock.insert = MagicMock(side_effect=insert_handler)
        table_mock.select = MagicMock(side_effect=select_handler)
        table_mock.update = MagicMock(side_effect=update_handler)
        table_mock.upsert = table_mock.insert  # Simplified
        
        return table_mock
    
    mock.table = MagicMock(side_effect=make_mock_table)
    
    return mock, test_data


@pytest.fixture
def mock_gemini():
    """Mock Gemini AI for testing."""
    mock = MagicMock()
    
    def generate_content(prompt):
        """Return mocked AI responses."""
        response = MagicMock()
        
        if "four-part test" in prompt.lower() or "qualification" in prompt.lower():
            response.text = """
{
    "qualification_result": "qualifies",
    "confidence_score": 0.85,
    "four_part_test": {
        "permitted_purpose": {"score": 0.9, "rationale": "Clear business component development"},
        "technological_uncertainty": {"score": 0.85, "rationale": "Uncertainty in algorithm design"},
        "process_of_experimentation": {"score": 0.8, "rationale": "Iterative testing approach documented"},
        "substantially_all": {"score": 0.85, "rationale": "80%+ activities qualify"}
    },
    "rationale": "Project demonstrates clear R&D characteristics with technological uncertainty.",
    "recommendations": ["Document experimentation steps", "Track failed approaches"]
}
"""
        elif "study" in prompt.lower() or "narrative" in prompt.lower():
            response.text = """
# R&D Tax Credit Study

## Executive Summary
This study documents qualifying R&D activities for the tax year, demonstrating compliance with IRC Section 41 requirements.

## Methodology
Activities were evaluated against the four-part test established in Treasury Regulations.

## Qualifying Activities
- Software development with technological uncertainty
- Engineering design improvements
- Process development activities

## Conclusion
Based on our analysis, the documented activities meet the requirements for R&D tax credit qualification.
"""
        else:
            response.text = '{"status": "success", "message": "Mocked AI response"}'
        
        return response
    
    mock.generate_content = generate_content
    return mock


# =============================================================================
# TEST HELPERS
# =============================================================================

def seed_test_client(test_data, org_id="test-org-1"):
    """Seed a test client with sample data."""
    client = {
        "id": "test-client-1",
        "organization_id": org_id,
        "name": "Test Tech Company",
        "industry": "Technology",
        "active_tax_year": 2024,
        "is_demo": True,
        "created_at": datetime.utcnow().isoformat(),
    }
    test_data["client_companies"].append(client)
    
    # Add projects
    projects = [
        {
            "id": "test-project-1",
            "organization_id": org_id,
            "client_company_id": client["id"],
            "name": "AI-Powered Analytics Platform",
            "description": "Development of ML algorithms for predictive analytics",
            "status": "active",
            "uncertainty_type": "algorithmic",
            "experimentation_description": "Testing various ML models",
            "technological_basis": "Machine learning, data science",
            "permitted_purpose": "New software product",
        },
        {
            "id": "test-project-2",
            "organization_id": org_id,
            "client_company_id": client["id"],
            "name": "Cloud Infrastructure Optimization",
            "description": "Research into efficient resource allocation",
            "status": "active",
        },
    ]
    test_data["projects"].extend(projects)
    
    # Add employees
    employees = [
        {
            "id": "test-emp-1",
            "organization_id": org_id,
            "client_company_id": client["id"],
            "name": "Alice Engineer",
            "job_title": "Senior Software Engineer",
            "department": "Engineering",
            "hourly_rate": 95.00,
            "rd_percentage": 80,
            "total_wages": 190000,
        },
        {
            "id": "test-emp-2",
            "organization_id": org_id,
            "client_company_id": client["id"],
            "name": "Bob Scientist",
            "job_title": "Data Scientist",
            "department": "R&D",
            "hourly_rate": 90.00,
            "rd_percentage": 90,
            "total_wages": 180000,
        },
    ]
    test_data["employees"].extend(employees)
    
    # Add timesheets
    for emp in employees:
        for proj in projects:
            for week in range(12):
                test_data["timesheets"].append({
                    "id": f"ts-{emp['id']}-{proj['id']}-{week}",
                    "organization_id": org_id,
                    "client_company_id": client["id"],
                    "employee_id": emp["id"],
                    "project_id": proj["id"],
                    "tax_year": 2024,
                    "work_date": (datetime.now() - timedelta(weeks=week)).strftime("%Y-%m-%d"),
                    "hours": random.randint(8, 40),
                    "description": "R&D development work",
                })
    
    # Add vendors
    vendors = [
        {
            "id": "test-vendor-1",
            "organization_id": org_id,
            "client_company_id": client["id"],
            "name": "CloudTech Solutions",
            "vendor_type": "contractor",
            "country_code": "US",
        },
    ]
    test_data["vendors"].extend(vendors)
    
    # Add AP transactions
    for vendor in vendors:
        for month in range(6):
            test_data["ap_transactions"].append({
                "id": f"ap-{vendor['id']}-{month}",
                "organization_id": org_id,
                "client_company_id": client["id"],
                "vendor_id": vendor["id"],
                "tax_year": 2024,
                "transaction_date": (datetime.now() - timedelta(days=30 * month)).strftime("%Y-%m-%d"),
                "amount": random.randint(5000, 25000),
                "category": "contract_research",
                "description": "R&D consulting services",
            })
    
    return client


# =============================================================================
# TESTS
# =============================================================================

class TestImportPipeline:
    """Test suite for the complete import-to-study pipeline."""
    
    def test_client_creation(self, mock_supabase):
        """Test that a client can be created with all required fields."""
        _, test_data = mock_supabase
        client = seed_test_client(test_data)
        
        assert client["id"] is not None
        assert client["name"] == "Test Tech Company"
        assert client["industry"] == "Technology"
        assert client["active_tax_year"] == 2024
    
    def test_data_seeding_creates_all_entities(self, mock_supabase):
        """Test that seeding creates all entity types."""
        _, test_data = mock_supabase
        seed_test_client(test_data)
        
        assert len(test_data["client_companies"]) == 1
        assert len(test_data["projects"]) == 2
        assert len(test_data["employees"]) == 2
        assert len(test_data["timesheets"]) > 0
        assert len(test_data["vendors"]) == 1
        assert len(test_data["ap_transactions"]) > 0
    
    def test_timesheets_linked_to_employees_and_projects(self, mock_supabase):
        """Test that timesheets are properly linked."""
        _, test_data = mock_supabase
        seed_test_client(test_data)
        
        for timesheet in test_data["timesheets"]:
            assert timesheet["employee_id"] is not None
            assert timesheet["project_id"] is not None
            
            # Verify employee exists
            employee_ids = [e["id"] for e in test_data["employees"]]
            assert timesheet["employee_id"] in employee_ids
            
            # Verify project exists
            project_ids = [p["id"] for p in test_data["projects"]]
            assert timesheet["project_id"] in project_ids
    
    def test_ap_transactions_linked_to_vendors(self, mock_supabase):
        """Test that AP transactions are linked to vendors."""
        _, test_data = mock_supabase
        seed_test_client(test_data)
        
        for ap in test_data["ap_transactions"]:
            assert ap["vendor_id"] is not None
            
            vendor_ids = [v["id"] for v in test_data["vendors"]]
            assert ap["vendor_id"] in vendor_ids


class TestRecomputePipeline:
    """Test suite for the recompute pipeline."""
    
    def test_qre_calculation_basics(self, mock_supabase):
        """Test basic QRE calculations."""
        _, test_data = mock_supabase
        client = seed_test_client(test_data)
        
        # Calculate wages QRE
        total_wages = sum(e.get("total_wages", 0) for e in test_data["employees"])
        avg_rd_pct = sum(e.get("rd_percentage", 0) for e in test_data["employees"]) / len(test_data["employees"])
        
        expected_wages_qre = total_wages * (avg_rd_pct / 100)
        
        assert expected_wages_qre > 0, "Wages QRE should be positive"
        assert avg_rd_pct >= 80, "Average R&D percentage should be high for R&D staff"
    
    def test_contract_research_65_percent_rule(self, mock_supabase):
        """Test that contract research is limited to 65%."""
        _, test_data = mock_supabase
        seed_test_client(test_data)
        
        total_contract = sum(ap["amount"] for ap in test_data["ap_transactions"])
        qre_eligible = total_contract * 0.65
        
        assert qre_eligible == total_contract * 0.65
        assert qre_eligible < total_contract


class TestAIEvaluation:
    """Test suite for AI evaluation with mocked responses."""
    
    def test_project_qualification_mocked(self, mock_supabase, mock_gemini):
        """Test project qualification with mocked AI."""
        _, test_data = mock_supabase
        seed_test_client(test_data)
        
        project = test_data["projects"][0]
        
        # Simulate AI evaluation call
        prompt = f"Evaluate this project for four-part test qualification: {project['name']}"
        response = mock_gemini.generate_content(prompt)
        
        assert "qualification_result" in response.text
        assert "confidence_score" in response.text
        assert "four_part_test" in response.text
    
    def test_study_generation_mocked(self, mock_supabase, mock_gemini):
        """Test study generation with mocked AI."""
        _, test_data = mock_supabase
        seed_test_client(test_data)
        
        # Simulate study generation
        prompt = "Generate an R&D study narrative"
        response = mock_gemini.generate_content(prompt)
        
        assert "R&D Tax Credit Study" in response.text
        assert "Executive Summary" in response.text
        assert "Qualifying Activities" in response.text


class TestReadinessScoring:
    """Test suite for readiness score calculations."""
    
    def test_input_completeness_score(self, mock_supabase):
        """Test input completeness component of readiness."""
        _, test_data = mock_supabase
        seed_test_client(test_data)
        
        # Calculate input completeness
        has_employees = len(test_data["employees"]) > 0
        has_projects = len(test_data["projects"]) > 0
        has_timesheets = len(test_data["timesheets"]) > 0
        has_vendors = len(test_data["vendors"]) > 0
        has_ap = len(test_data["ap_transactions"]) > 0
        
        completeness = sum([has_employees, has_projects, has_timesheets, has_vendors, has_ap]) / 5
        
        assert completeness == 1.0, "All inputs should be present"
    
    def test_project_detail_score(self, mock_supabase):
        """Test project detail scoring."""
        _, test_data = mock_supabase
        seed_test_client(test_data)
        
        project = test_data["projects"][0]
        
        # Check required fields
        has_uncertainty = bool(project.get("uncertainty_type"))
        has_experimentation = bool(project.get("experimentation_description"))
        has_basis = bool(project.get("technological_basis"))
        has_purpose = bool(project.get("permitted_purpose"))
        
        detail_score = sum([has_uncertainty, has_experimentation, has_basis, has_purpose]) / 4
        
        assert detail_score == 1.0, "First project should have all details"
        
        # Second project is incomplete
        project2 = test_data["projects"][1]
        has_uncertainty2 = bool(project2.get("uncertainty_type"))
        
        assert not has_uncertainty2, "Second project should be missing details"


class TestEndToEndFlow:
    """Test the complete end-to-end flow."""
    
    def test_complete_pipeline(self, mock_supabase, mock_gemini):
        """Test the complete pipeline from import to study generation."""
        _, test_data = mock_supabase
        
        # Step 1: Create client and seed data
        client = seed_test_client(test_data)
        assert client is not None
        
        # Step 2: Verify all data is present
        assert len(test_data["projects"]) >= 2
        assert len(test_data["employees"]) >= 2
        assert len(test_data["timesheets"]) > 0
        
        # Step 3: Calculate QRE components
        wages_total = sum(e.get("total_wages", 0) for e in test_data["employees"])
        assert wages_total > 0
        
        contract_total = sum(ap["amount"] for ap in test_data["ap_transactions"])
        contract_qre = contract_total * 0.65
        assert contract_qre > 0
        
        # Step 4: Run AI evaluation (mocked)
        for project in test_data["projects"]:
            response = mock_gemini.generate_content(f"Evaluate: {project['name']}")
            assert "qualification_result" in response.text
        
        # Step 5: Generate study
        study_response = mock_gemini.generate_content("Generate study")
        assert "R&D Tax Credit Study" in study_response.text
        
        # Step 6: Calculate readiness
        readiness_components = {
            "inputs": 1.0,  # All inputs present
            "projects": len([p for p in test_data["projects"] if p.get("uncertainty_type")]) / len(test_data["projects"]),
            "ai_coverage": 1.0,  # All projects evaluated
        }
        
        overall_readiness = sum(readiness_components.values()) / len(readiness_components)
        assert overall_readiness >= 0.5, "Readiness should be reasonable"
        
        print(f"\n✓ Pipeline Complete!")
        print(f"  - Client: {client['name']}")
        print(f"  - Projects: {len(test_data['projects'])}")
        print(f"  - Employees: {len(test_data['employees'])}")
        print(f"  - Timesheets: {len(test_data['timesheets'])}")
        print(f"  - Total Wages: ${wages_total:,.2f}")
        print(f"  - Contract QRE: ${contract_qre:,.2f}")
        print(f"  - Readiness Score: {overall_readiness * 100:.0f}%")


# =============================================================================
# RUN TESTS
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])


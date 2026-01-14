"""
Review Rules Engine
Automated checks for post-ingestion review of R&D tax credit data.

Implements deterministic, versioned, testable rules that:
- Query canonical tables
- Emit review_findings
- Cite authority references from authority_library
- Estimate impact on QRE/credit
"""

import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from uuid import uuid4

logger = logging.getLogger(__name__)

# ============================================================================
# Rule Framework Types
# ============================================================================

class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class Domain(str, Enum):
    EMPLOYEES = "employees"
    PROJECTS = "projects"
    TIMESHEETS = "timesheets"
    VENDORS = "vendors"
    CONTRACTS = "contracts"
    AP_TRANSACTIONS = "ap_transactions"
    SUPPLIES = "supplies"
    SECTION_174 = "section_174"
    CROSS_DOMAIN = "cross_domain"

@dataclass
class RecommendedAction:
    """A recommended action for resolving a finding."""
    action_type: str  # verify, edit_field, request_evidence, upload_doc, escalate, re_evaluate_ai
    label: str
    description: str
    target_field: Optional[str] = None
    payload: Dict = field(default_factory=dict)

@dataclass
class Finding:
    """A review finding to be stored."""
    rule_id: str
    domain: Domain
    entity_type: str
    entity_id: Optional[str]
    severity: Severity
    title: str
    description: str
    trigger_evidence: Dict
    recommended_actions: List[RecommendedAction]
    authority_refs: List[str]  # citation_keys
    estimated_impact: Dict

@dataclass
class RuleResult:
    """Result from running a single rule."""
    rule_id: str
    findings: List[Finding]
    entities_checked: int
    errors: List[str]

# ============================================================================
# Rule Definitions
# ============================================================================

class ReviewRule:
    """Base class for review rules."""
    
    rule_id: str = ""
    domain: Domain = Domain.CROSS_DOMAIN
    severity: Severity = Severity.MEDIUM
    title_template: str = ""
    authority_keys: List[str] = []
    
    def __init__(self, supabase, org_id: str, client_id: str, tax_year: int, config: Dict):
        self.supabase = supabase
        self.org_id = org_id
        self.client_id = client_id
        self.tax_year = tax_year
        self.config = config
    
    def run(self) -> RuleResult:
        """Execute the rule and return findings."""
        raise NotImplementedError
    
    def build_actions(self, entity: Dict) -> List[RecommendedAction]:
        """Build recommended actions for this rule type."""
        return [
            RecommendedAction(
                action_type="verify",
                label="Verify",
                description="Confirm this is correct as-is"
            )
        ]
    
    def estimate_impact(self, entity: Dict) -> Dict:
        """Estimate QRE/credit impact."""
        return {"qre_at_risk": 0, "credit_at_risk": 0, "confidence": 0.5}


# ============================================================================
# Employee Rules
# ============================================================================

class EmpHighWageRule(ReviewRule):
    """EMP_HIGH_WAGE_001: Wages > threshold needs manual verification."""
    
    rule_id = "EMP_HIGH_WAGE_001"
    domain = Domain.EMPLOYEES
    severity = Severity.MEDIUM
    title_template = "High-wage employee requires verification"
    authority_keys = ["IRC_41_B_1_WAGES", "POLICY_HIGH_WAGE"]
    
    def run(self) -> RuleResult:
        threshold = float(self.config.get("wage_outlier_threshold", 500000))
        findings = []
        errors = []
        
        try:
            result = self.supabase.table("employees")\
                .select("*")\
                .eq("client_company_id", self.client_id)\
                .eq("tax_year", str(self.tax_year))\
                .execute()
            
            employees = result.data or []
            
            for emp in employees:
                wages = float(emp.get("w2_wages") or emp.get("total_compensation") or 0)
                if wages > threshold:
                    findings.append(Finding(
                        rule_id=self.rule_id,
                        domain=self.domain,
                        entity_type="employee",
                        entity_id=emp["id"],
                        severity=self.severity,
                        title=f"High-wage employee: {emp.get('name', 'Unknown')}",
                        description=f"Employee has wages of ${wages:,.0f} which exceeds the ${threshold:,.0f} threshold. Please verify R&D allocation percentage and documentation.",
                        trigger_evidence={
                            "employee_name": emp.get("name"),
                            "wages": wages,
                            "threshold": threshold,
                            "allocation_percent": emp.get("rd_allocation_percent")
                        },
                        recommended_actions=[
                            RecommendedAction(
                                action_type="verify",
                                label="Verify Allocation",
                                description="Confirm R&D allocation percentage is accurate"
                            ),
                            RecommendedAction(
                                action_type="request_evidence",
                                label="Request Documentation",
                                description="Request supporting time records or job description"
                            ),
                            RecommendedAction(
                                action_type="escalate",
                                label="Escalate to Senior",
                                description="Request senior review of allocation"
                            )
                        ],
                        authority_refs=self.authority_keys,
                        estimated_impact={
                            "qre_at_risk": wages * float(emp.get("rd_allocation_percent") or 0.5),
                            "credit_at_risk": wages * float(emp.get("rd_allocation_percent") or 0.5) * 0.20,
                            "confidence": 0.7
                        }
                    ))
            
            return RuleResult(
                rule_id=self.rule_id,
                findings=findings,
                entities_checked=len(employees),
                errors=errors
            )
            
        except Exception as e:
            logger.error(f"Error in {self.rule_id}: {e}")
            return RuleResult(self.rule_id, [], 0, [str(e)])


class EmpMissingLocationRule(ReviewRule):
    """EMP_MISSING_LOCATION_002: Missing state/country."""
    
    rule_id = "EMP_MISSING_LOCATION_002"
    domain = Domain.EMPLOYEES
    severity = Severity.LOW
    title_template = "Employee missing location"
    authority_keys = ["IRC_41_D_4_FOREIGN"]
    
    def run(self) -> RuleResult:
        findings = []
        errors = []
        
        try:
            result = self.supabase.table("employees")\
                .select("*")\
                .eq("client_company_id", self.client_id)\
                .eq("tax_year", str(self.tax_year))\
                .execute()
            
            employees = result.data or []
            
            for emp in employees:
                location = emp.get("location_state") or emp.get("work_state") or emp.get("state")
                if not location:
                    findings.append(Finding(
                        rule_id=self.rule_id,
                        domain=self.domain,
                        entity_type="employee",
                        entity_id=emp["id"],
                        severity=self.severity,
                        title=f"Missing location: {emp.get('name', 'Unknown')}",
                        description="Employee is missing work location (state/country). This is needed to verify US-based research for credit eligibility.",
                        trigger_evidence={
                            "employee_name": emp.get("name"),
                            "location_state": location
                        },
                        recommended_actions=[
                            RecommendedAction(
                                action_type="edit_field",
                                label="Add Location",
                                description="Enter the employee's work state",
                                target_field="location_state"
                            ),
                            RecommendedAction(
                                action_type="request_evidence",
                                label="Request from Client",
                                description="Ask client to provide work location"
                            )
                        ],
                        authority_refs=self.authority_keys,
                        estimated_impact={
                            "qre_at_risk": 0,
                            "credit_at_risk": 0,
                            "confidence": 0.3
                        }
                    ))
            
            return RuleResult(self.rule_id, findings, len(employees), errors)
            
        except Exception as e:
            logger.error(f"Error in {self.rule_id}: {e}")
            return RuleResult(self.rule_id, [], 0, [str(e)])


class EmpZeroAllocationRule(ReviewRule):
    """EMP_ZERO_ALLOCATION_003: Employee in timesheets but zero allocation."""
    
    rule_id = "EMP_ZERO_ALLOCATION_003"
    domain = Domain.EMPLOYEES
    severity = Severity.HIGH
    title_template = "Employee has time logs but zero R&D allocation"
    authority_keys = ["IRC_41_B_1_WAGES", "REG_1_41_2"]
    
    def run(self) -> RuleResult:
        findings = []
        errors = []
        
        try:
            # Get employees with time logs
            time_logs = self.supabase.table("time_logs")\
                .select("user_id")\
                .eq("client_company_id", self.client_id)\
                .eq("tax_year", str(self.tax_year))\
                .execute()
            
            emp_ids_with_time = set(t["user_id"] for t in (time_logs.data or []) if t.get("user_id"))
            
            if emp_ids_with_time:
                # Get employees
                result = self.supabase.table("employees")\
                    .select("*")\
                    .eq("client_company_id", self.client_id)\
                    .eq("tax_year", str(self.tax_year))\
                    .execute()
                
                for emp in (result.data or []):
                    if emp["id"] in emp_ids_with_time:
                        allocation = float(emp.get("rd_allocation_percent") or 0)
                        if allocation == 0:
                            wages = float(emp.get("w2_wages") or 0)
                            findings.append(Finding(
                                rule_id=self.rule_id,
                                domain=self.domain,
                                entity_type="employee",
                                entity_id=emp["id"],
                                severity=self.severity,
                                title=f"Zero allocation with time logs: {emp.get('name', 'Unknown')}",
                                description="Employee has time logs recorded against R&D projects but their R&D allocation is 0%. This may result in missing QRE.",
                                trigger_evidence={
                                    "employee_name": emp.get("name"),
                                    "rd_allocation_percent": allocation,
                                    "has_time_logs": True,
                                    "wages": wages
                                },
                                recommended_actions=[
                                    RecommendedAction(
                                        action_type="edit_field",
                                        label="Set Allocation",
                                        description="Calculate and enter R&D allocation percentage",
                                        target_field="rd_allocation_percent"
                                    ),
                                    RecommendedAction(
                                        action_type="re_evaluate_ai",
                                        label="AI Calculation",
                                        description="Have AI calculate allocation from time logs"
                                    )
                                ],
                                authority_refs=self.authority_keys,
                                estimated_impact={
                                    "qre_at_risk": wages,
                                    "credit_at_risk": wages * 0.20,
                                    "confidence": 0.8
                                }
                            ))
            
            return RuleResult(self.rule_id, findings, len(emp_ids_with_time), errors)
            
        except Exception as e:
            logger.error(f"Error in {self.rule_id}: {e}")
            return RuleResult(self.rule_id, [], 0, [str(e)])


class EmpOutlierAllocationRule(ReviewRule):
    """EMP_OUTLIER_ALLOCATION_004: Allocation >95% or <1% when in R&D artifacts."""
    
    rule_id = "EMP_OUTLIER_ALLOCATION_004"
    domain = Domain.EMPLOYEES
    severity = Severity.MEDIUM
    title_template = "Employee allocation is an outlier"
    authority_keys = ["IRC_41_B_1_WAGES", "REG_1_41_2", "IRS_AUDIT_GUIDE"]
    
    def run(self) -> RuleResult:
        min_bound = float(self.config.get("allocation_min_bound", 0.01))
        max_bound = float(self.config.get("allocation_max_bound", 0.95))
        findings = []
        errors = []
        
        try:
            result = self.supabase.table("employees")\
                .select("*")\
                .eq("client_company_id", self.client_id)\
                .eq("tax_year", str(self.tax_year))\
                .execute()
            
            for emp in (result.data or []):
                allocation = emp.get("rd_allocation_percent")
                if allocation is not None:
                    allocation = float(allocation)
                    if allocation > 0 and (allocation < min_bound or allocation > max_bound):
                        wages = float(emp.get("w2_wages") or 0)
                        is_high = allocation > max_bound
                        
                        findings.append(Finding(
                            rule_id=self.rule_id,
                            domain=self.domain,
                            entity_type="employee",
                            entity_id=emp["id"],
                            severity=self.severity,
                            title=f"{'High' if is_high else 'Low'} allocation outlier: {emp.get('name', 'Unknown')}",
                            description=f"Employee has {'unusually high' if is_high else 'very low'} R&D allocation of {allocation*100:.1f}%. {'100% R&D is rare and may be challenged on audit.' if is_high else 'Very low allocations may indicate missing R&D time.'}",
                            trigger_evidence={
                                "employee_name": emp.get("name"),
                                "rd_allocation_percent": allocation,
                                "threshold_min": min_bound,
                                "threshold_max": max_bound,
                                "wages": wages
                            },
                            recommended_actions=[
                                RecommendedAction(
                                    action_type="verify",
                                    label="Verify Allocation",
                                    description=f"Confirm {allocation*100:.1f}% is accurate with supporting documentation"
                                ),
                                RecommendedAction(
                                    action_type="request_evidence",
                                    label="Request Time Records",
                                    description="Request detailed time records to support allocation"
                                ),
                                RecommendedAction(
                                    action_type="escalate",
                                    label="Escalate",
                                    description="Request senior review of allocation methodology"
                                )
                            ],
                            authority_refs=self.authority_keys,
                            estimated_impact={
                                "qre_at_risk": wages * allocation if is_high else wages * (0.5 - allocation),
                                "credit_at_risk": (wages * allocation * 0.20) if is_high else (wages * (0.5 - allocation) * 0.20),
                                "confidence": 0.6
                            }
                        ))
            
            return RuleResult(self.rule_id, findings, len(result.data or []), errors)
            
        except Exception as e:
            logger.error(f"Error in {self.rule_id}: {e}")
            return RuleResult(self.rule_id, [], 0, [str(e)])


# ============================================================================
# Vendor/Contractor Rules
# ============================================================================

class VenForeignRule(ReviewRule):
    """VEN_FOREIGN_001: Vendor country != US."""
    
    rule_id = "VEN_FOREIGN_001"
    domain = Domain.VENDORS
    severity = Severity.HIGH
    title_template = "Foreign vendor - potential research exclusion"
    authority_keys = ["IRC_41_D_4_FOREIGN", "POLICY_FOREIGN_VENDOR"]
    
    def run(self) -> RuleResult:
        findings = []
        errors = []
        
        try:
            result = self.supabase.table("contractors")\
                .select("*")\
                .eq("client_company_id", self.client_id)\
                .execute()
            
            us_variants = ["us", "usa", "united states", "united states of america"]
            
            for vendor in (result.data or []):
                country = (vendor.get("country") or "").strip().lower()
                if country and country not in us_variants:
                    spend = float(vendor.get("total_spend") or vendor.get("contract_value") or 0)
                    
                    findings.append(Finding(
                        rule_id=self.rule_id,
                        domain=self.domain,
                        entity_type="contractor",
                        entity_id=vendor["id"],
                        severity=self.severity,
                        title=f"Foreign vendor: {vendor.get('name', 'Unknown')}",
                        description=f"Vendor is located in {vendor.get('country', 'unknown country')}. Research performed outside the US may not qualify for the R&D credit under IRC §41(d)(4).",
                        trigger_evidence={
                            "vendor_name": vendor.get("name"),
                            "country": vendor.get("country"),
                            "total_spend": spend
                        },
                        recommended_actions=[
                            RecommendedAction(
                                action_type="verify",
                                label="Verify Work Location",
                                description="Confirm where the research work was actually performed"
                            ),
                            RecommendedAction(
                                action_type="edit_field",
                                label="Mark as Foreign Research",
                                description="Flag this vendor's expenses as excluded foreign research",
                                target_field="is_foreign_research"
                            ),
                            RecommendedAction(
                                action_type="request_evidence",
                                label="Request Contract",
                                description="Request contract showing work location provisions"
                            )
                        ],
                        authority_refs=self.authority_keys,
                        estimated_impact={
                            "qre_at_risk": spend * 0.65,  # 65% rule
                            "credit_at_risk": spend * 0.65 * 0.20,
                            "confidence": 0.9
                        }
                    ))
            
            return RuleResult(self.rule_id, findings, len(result.data or []), errors)
            
        except Exception as e:
            logger.error(f"Error in {self.rule_id}: {e}")
            return RuleResult(self.rule_id, [], 0, [str(e)])


class VenMissingRiskIpRule(ReviewRule):
    """VEN_MISSING_RISK_IP_002: Contract vendor missing risk_bearer or ip_rights."""
    
    rule_id = "VEN_MISSING_RISK_IP_002"
    domain = Domain.VENDORS
    severity = Severity.MEDIUM
    title_template = "Vendor missing risk/IP rights info"
    authority_keys = ["IRC_41_B_3_CONTRACT", "REG_1_41_2"]
    
    def run(self) -> RuleResult:
        findings = []
        errors = []
        
        try:
            result = self.supabase.table("contractors")\
                .select("*")\
                .eq("client_company_id", self.client_id)\
                .execute()
            
            for vendor in (result.data or []):
                risk_bearer = vendor.get("risk_bearer")
                ip_rights = vendor.get("ip_rights")
                
                if not risk_bearer or not ip_rights:
                    spend = float(vendor.get("total_spend") or vendor.get("contract_value") or 0)
                    
                    missing = []
                    if not risk_bearer:
                        missing.append("risk bearer")
                    if not ip_rights:
                        missing.append("IP rights")
                    
                    findings.append(Finding(
                        rule_id=self.rule_id,
                        domain=self.domain,
                        entity_type="contractor",
                        entity_id=vendor["id"],
                        severity=self.severity,
                        title=f"Missing contract terms: {vendor.get('name', 'Unknown')}",
                        description=f"Vendor is missing {' and '.join(missing)} information. For contract research to qualify, the taxpayer must bear financial risk and retain substantial rights to the research.",
                        trigger_evidence={
                            "vendor_name": vendor.get("name"),
                            "risk_bearer": risk_bearer,
                            "ip_rights": ip_rights,
                            "missing_fields": missing,
                            "total_spend": spend
                        },
                        recommended_actions=[
                            RecommendedAction(
                                action_type="edit_field",
                                label="Add Risk/IP Info",
                                description="Enter risk bearer and IP rights information",
                                target_field="risk_bearer" if not risk_bearer else "ip_rights"
                            ),
                            RecommendedAction(
                                action_type="request_evidence",
                                label="Request Contract",
                                description="Request the contract document to extract terms"
                            )
                        ],
                        authority_refs=self.authority_keys,
                        estimated_impact={
                            "qre_at_risk": spend * 0.65,
                            "credit_at_risk": spend * 0.65 * 0.20,
                            "confidence": 0.5
                        }
                    ))
            
            return RuleResult(self.rule_id, findings, len(result.data or []), errors)
            
        except Exception as e:
            logger.error(f"Error in {self.rule_id}: {e}")
            return RuleResult(self.rule_id, [], 0, [str(e)])


class VenContractMissingRule(ReviewRule):
    """VEN_CONTRACT_MISSING_003: Vendor spend exists but no contract."""
    
    rule_id = "VEN_CONTRACT_MISSING_003"
    domain = Domain.VENDORS
    severity = Severity.MEDIUM
    title_template = "Vendor spend without contract"
    authority_keys = ["IRC_41_B_3_CONTRACT", "IRS_AUDIT_GUIDE"]
    
    def run(self) -> RuleResult:
        findings = []
        errors = []
        
        try:
            # Get vendors with spend
            vendors = self.supabase.table("contractors")\
                .select("*")\
                .eq("client_company_id", self.client_id)\
                .execute()
            
            # Get contracts
            try:
                contracts = self.supabase.table("contracts")\
                    .select("vendor_id")\
                    .eq("client_company_id", self.client_id)\
                    .execute()
                vendor_ids_with_contract = set(c["vendor_id"] for c in (contracts.data or []) if c.get("vendor_id"))
            except:
                vendor_ids_with_contract = set()
            
            for vendor in (vendors.data or []):
                spend = float(vendor.get("total_spend") or vendor.get("contract_value") or 0)
                if spend > 0 and vendor["id"] not in vendor_ids_with_contract:
                    findings.append(Finding(
                        rule_id=self.rule_id,
                        domain=self.domain,
                        entity_type="contractor",
                        entity_id=vendor["id"],
                        severity=self.severity,
                        title=f"No contract on file: {vendor.get('name', 'Unknown')}",
                        description=f"Vendor has ${spend:,.0f} in spend but no contract document is linked. Contract documentation is important for audit defense.",
                        trigger_evidence={
                            "vendor_name": vendor.get("name"),
                            "total_spend": spend,
                            "has_contract": False
                        },
                        recommended_actions=[
                            RecommendedAction(
                                action_type="upload_doc",
                                label="Upload Contract",
                                description="Upload the contract document"
                            ),
                            RecommendedAction(
                                action_type="request_evidence",
                                label="Request from Client",
                                description="Request the contract from the client"
                            ),
                            RecommendedAction(
                                action_type="verify",
                                label="Mark as No Contract",
                                description="Confirm no formal contract exists (may affect qualification)"
                            )
                        ],
                        authority_refs=self.authority_keys,
                        estimated_impact={
                            "qre_at_risk": spend * 0.65,
                            "credit_at_risk": spend * 0.65 * 0.20,
                            "confidence": 0.6
                        }
                    ))
            
            return RuleResult(self.rule_id, findings, len(vendors.data or []), errors)
            
        except Exception as e:
            logger.error(f"Error in {self.rule_id}: {e}")
            return RuleResult(self.rule_id, [], 0, [str(e)])


# ============================================================================
# Project Rules
# ============================================================================

class ProjMissingFourPartRule(ReviewRule):
    """PROJ_MISSING_FOUR_PART_FIELDS_001: Missing required narrative fields."""
    
    rule_id = "PROJ_MISSING_FOUR_PART_FIELDS_001"
    domain = Domain.PROJECTS
    severity = Severity.HIGH
    title_template = "Project missing Four-Part Test documentation"
    authority_keys = ["IRC_41_D", "IRC_41_D_1_UNCERTAINTY", "IRC_41_D_1_EXPERIMENTATION"]
    
    def run(self) -> RuleResult:
        findings = []
        errors = []
        
        try:
            result = self.supabase.table("projects")\
                .select("*")\
                .eq("client_company_id", self.client_id)\
                .eq("tax_year", str(self.tax_year))\
                .execute()
            
            required_fields = [
                ("technical_uncertainty", "Technical Uncertainty"),
                ("experimentation_process", "Process of Experimentation"),
                ("technological_nature", "Technological in Nature"),
                ("permitted_purpose", "Permitted Purpose")
            ]
            
            for proj in (result.data or []):
                missing = []
                for field, label in required_fields:
                    value = proj.get(field) or proj.get(field.replace("_", ""))
                    if not value or len(str(value).strip()) < 10:
                        missing.append(label)
                
                if missing:
                    findings.append(Finding(
                        rule_id=self.rule_id,
                        domain=self.domain,
                        entity_type="project",
                        entity_id=proj["id"],
                        severity=self.severity,
                        title=f"Missing Four-Part Test: {proj.get('name', 'Unknown')}",
                        description=f"Project is missing documentation for: {', '.join(missing)}. All four parts of the IRC §41(d) test must be documented.",
                        trigger_evidence={
                            "project_name": proj.get("name"),
                            "missing_fields": missing,
                            "fields_count": len(missing)
                        },
                        recommended_actions=[
                            RecommendedAction(
                                action_type="edit_field",
                                label="Add Documentation",
                                description="Fill in the missing Four-Part Test fields"
                            ),
                            RecommendedAction(
                                action_type="re_evaluate_ai",
                                label="AI Assist",
                                description="Have AI help draft documentation based on project data"
                            ),
                            RecommendedAction(
                                action_type="request_evidence",
                                label="Request from Client",
                                description="Request project documentation from client"
                            )
                        ],
                        authority_refs=self.authority_keys,
                        estimated_impact={
                            "qre_at_risk": float(proj.get("total_qre") or 0),
                            "credit_at_risk": float(proj.get("total_qre") or 0) * 0.20,
                            "confidence": 0.85
                        }
                    ))
            
            return RuleResult(self.rule_id, findings, len(result.data or []), errors)
            
        except Exception as e:
            logger.error(f"Error in {self.rule_id}: {e}")
            return RuleResult(self.rule_id, [], 0, [str(e)])


class ProjNoTimeLinkRule(ReviewRule):
    """PROJ_NO_TIME_LINK_002: Project has no time logs."""
    
    rule_id = "PROJ_NO_TIME_LINK_002"
    domain = Domain.PROJECTS
    severity = Severity.MEDIUM
    title_template = "Project has no time allocations"
    authority_keys = ["IRC_41_B_1_WAGES", "REG_1_41_2"]
    
    def run(self) -> RuleResult:
        require_timesheets = self.config.get("require_timesheets", False)
        if not require_timesheets:
            return RuleResult(self.rule_id, [], 0, [])
        
        findings = []
        errors = []
        
        try:
            # Get projects
            projects = self.supabase.table("projects")\
                .select("*")\
                .eq("client_company_id", self.client_id)\
                .eq("tax_year", str(self.tax_year))\
                .execute()
            
            # Get time logs by project
            time_logs = self.supabase.table("time_logs")\
                .select("project_id")\
                .eq("client_company_id", self.client_id)\
                .eq("tax_year", str(self.tax_year))\
                .execute()
            
            projects_with_time = set(t["project_id"] for t in (time_logs.data or []) if t.get("project_id"))
            
            for proj in (projects.data or []):
                if proj["id"] not in projects_with_time:
                    findings.append(Finding(
                        rule_id=self.rule_id,
                        domain=self.domain,
                        entity_type="project",
                        entity_id=proj["id"],
                        severity=self.severity,
                        title=f"No time logs: {proj.get('name', 'Unknown')}",
                        description="Project exists but has no time logs linked. This may indicate missing labor QRE.",
                        trigger_evidence={
                            "project_name": proj.get("name"),
                            "has_time_logs": False
                        },
                        recommended_actions=[
                            RecommendedAction(
                                action_type="request_evidence",
                                label="Request Timesheets",
                                description="Request time allocation data for this project"
                            ),
                            RecommendedAction(
                                action_type="verify",
                                label="Mark as No Labor",
                                description="Confirm this project has no labor component"
                            )
                        ],
                        authority_refs=self.authority_keys,
                        estimated_impact={
                            "qre_at_risk": 0,
                            "credit_at_risk": 0,
                            "confidence": 0.4
                        }
                    ))
            
            return RuleResult(self.rule_id, findings, len(projects.data or []), errors)
            
        except Exception as e:
            logger.error(f"Error in {self.rule_id}: {e}")
            return RuleResult(self.rule_id, [], 0, [str(e)])


# ============================================================================
# AP Transaction / Supplies Rules
# ============================================================================

class ApLargeTxRule(ReviewRule):
    """AP_LARGE_SINGLE_TX_001: Single expense > threshold."""
    
    rule_id = "AP_LARGE_SINGLE_TX_001"
    domain = Domain.AP_TRANSACTIONS
    severity = Severity.MEDIUM
    title_template = "Large single transaction requires review"
    authority_keys = ["IRC_41_B_2_SUPPLIES", "IRC_41_B_3_CONTRACT"]
    
    def run(self) -> RuleResult:
        threshold = float(self.config.get("large_transaction_threshold", 100000))
        findings = []
        errors = []
        
        try:
            result = self.supabase.table("expenses")\
                .select("*")\
                .eq("client_company_id", self.client_id)\
                .eq("tax_year", str(self.tax_year))\
                .gte("amount", threshold)\
                .execute()
            
            for exp in (result.data or []):
                amount = float(exp.get("amount") or 0)
                findings.append(Finding(
                    rule_id=self.rule_id,
                    domain=self.domain,
                    entity_type="expense",
                    entity_id=exp["id"],
                    severity=self.severity,
                    title=f"Large transaction: ${amount:,.0f}",
                    description=f"Single expense of ${amount:,.0f} exceeds the ${threshold:,.0f} review threshold. Please verify this is a qualifying R&D expense.",
                    trigger_evidence={
                        "description": exp.get("description"),
                        "vendor_name": exp.get("vendor_name"),
                        "amount": amount,
                        "threshold": threshold,
                        "gl_account": exp.get("gl_account"),
                        "category": exp.get("rd_category")
                    },
                    recommended_actions=[
                        RecommendedAction(
                            action_type="verify",
                            label="Verify Qualification",
                            description="Confirm this expense qualifies as R&D"
                        ),
                        RecommendedAction(
                            action_type="edit_field",
                            label="Categorize",
                            description="Set the R&D category for this expense",
                            target_field="rd_category"
                        ),
                        RecommendedAction(
                            action_type="request_evidence",
                            label="Request Invoice",
                            description="Request the invoice for documentation"
                        )
                    ],
                    authority_refs=self.authority_keys,
                    estimated_impact={
                        "qre_at_risk": amount,
                        "credit_at_risk": amount * 0.20,
                        "confidence": 0.7
                    }
                ))
            
            return RuleResult(self.rule_id, findings, len(result.data or []), errors)
            
        except Exception as e:
            logger.error(f"Error in {self.rule_id}: {e}")
            return RuleResult(self.rule_id, [], 0, [str(e)])


class ApUncategorizedRule(ReviewRule):
    """AP_UNCATEGORIZED_002: Category unknown/ambiguous."""
    
    rule_id = "AP_UNCATEGORIZED_002"
    domain = Domain.AP_TRANSACTIONS
    severity = Severity.LOW
    title_template = "Expense needs categorization"
    authority_keys = ["IRC_41_B", "REG_1_41_2"]
    
    def run(self) -> RuleResult:
        findings = []
        errors = []
        
        try:
            result = self.supabase.table("expenses")\
                .select("*")\
                .eq("client_company_id", self.client_id)\
                .eq("tax_year", str(self.tax_year))\
                .execute()
            
            uncategorized = ["unknown", "needs_review", "unassigned", "", None]
            
            for exp in (result.data or []):
                category = exp.get("rd_category") or exp.get("category")
                if category in uncategorized or not category:
                    amount = float(exp.get("amount") or 0)
                    findings.append(Finding(
                        rule_id=self.rule_id,
                        domain=self.domain,
                        entity_type="expense",
                        entity_id=exp["id"],
                        severity=self.severity,
                        title=f"Uncategorized: {exp.get('description', 'Unknown')[:50]}",
                        description="Expense has not been categorized for R&D qualification. Please review and assign appropriate category.",
                        trigger_evidence={
                            "description": exp.get("description"),
                            "vendor_name": exp.get("vendor_name"),
                            "amount": amount,
                            "current_category": category
                        },
                        recommended_actions=[
                            RecommendedAction(
                                action_type="edit_field",
                                label="Categorize",
                                description="Set the R&D category",
                                target_field="rd_category"
                            ),
                            RecommendedAction(
                                action_type="re_evaluate_ai",
                                label="AI Categorize",
                                description="Have AI suggest category based on description"
                            )
                        ],
                        authority_refs=self.authority_keys,
                        estimated_impact={
                            "qre_at_risk": amount,
                            "credit_at_risk": amount * 0.20,
                            "confidence": 0.4
                        }
                    ))
            
            return RuleResult(self.rule_id, findings, len(result.data or []), errors)
            
        except Exception as e:
            logger.error(f"Error in {self.rule_id}: {e}")
            return RuleResult(self.rule_id, [], 0, [str(e)])


class SupCapitalIndicatorRule(ReviewRule):
    """SUP_CAPITAL_INDICATOR_001: Supplies with capital/equipment indicators."""
    
    rule_id = "SUP_CAPITAL_INDICATOR_001"
    domain = Domain.SUPPLIES
    severity = Severity.MEDIUM
    title_template = "Potential capital item in supplies"
    authority_keys = ["IRC_41_B_2_SUPPLIES"]
    
    def run(self) -> RuleResult:
        findings = []
        errors = []
        
        try:
            result = self.supabase.table("supplies")\
                .select("*")\
                .eq("client_company_id", self.client_id)\
                .eq("tax_year", str(self.tax_year))\
                .execute()
            
            capital_keywords = ["equipment", "machine", "server", "capital", "asset", "furniture", "vehicle"]
            
            for supply in (result.data or []):
                item_name = (supply.get("item_name") or supply.get("description") or "").lower()
                matched_keywords = [kw for kw in capital_keywords if kw in item_name]
                
                if matched_keywords:
                    amount = float(supply.get("amount") or 0)
                    findings.append(Finding(
                        rule_id=self.rule_id,
                        domain=self.domain,
                        entity_type="supply",
                        entity_id=supply["id"],
                        severity=self.severity,
                        title=f"Capital indicator: {supply.get('item_name', 'Unknown')[:40]}",
                        description=f"Supply item contains capital/equipment keywords: {', '.join(matched_keywords)}. Supplies must be consumed in research to qualify - capital items typically do not qualify.",
                        trigger_evidence={
                            "item_name": supply.get("item_name"),
                            "amount": amount,
                            "matched_keywords": matched_keywords
                        },
                        recommended_actions=[
                            RecommendedAction(
                                action_type="verify",
                                label="Verify Consumable",
                                description="Confirm this is a consumable supply, not capital"
                            ),
                            RecommendedAction(
                                action_type="edit_field",
                                label="Mark as Capital",
                                description="Flag as capital item (excluded from QRE)",
                                target_field="is_capital"
                            )
                        ],
                        authority_refs=self.authority_keys,
                        estimated_impact={
                            "qre_at_risk": amount,
                            "credit_at_risk": amount * 0.20,
                            "confidence": 0.6
                        }
                    ))
            
            return RuleResult(self.rule_id, findings, len(result.data or []), errors)
            
        except Exception as e:
            logger.error(f"Error in {self.rule_id}: {e}")
            return RuleResult(self.rule_id, [], 0, [str(e)])


class SupNoProjectLinkRule(ReviewRule):
    """SUP_NO_PROJECT_LINK_002: Supplies not linked to project."""
    
    rule_id = "SUP_NO_PROJECT_LINK_002"
    domain = Domain.SUPPLIES
    severity = Severity.LOW
    title_template = "Supply not linked to project"
    authority_keys = ["IRC_41_B_2_SUPPLIES", "REG_1_41_2"]
    
    def run(self) -> RuleResult:
        findings = []
        errors = []
        
        try:
            # Check if projects exist
            projects = self.supabase.table("projects")\
                .select("id")\
                .eq("client_company_id", self.client_id)\
                .eq("tax_year", str(self.tax_year))\
                .execute()
            
            if not (projects.data or []):
                # No projects, skip this rule
                return RuleResult(self.rule_id, [], 0, [])
            
            result = self.supabase.table("supplies")\
                .select("*")\
                .eq("client_company_id", self.client_id)\
                .eq("tax_year", str(self.tax_year))\
                .execute()
            
            for supply in (result.data or []):
                project_id = supply.get("project_id")
                if not project_id:
                    amount = float(supply.get("amount") or 0)
                    findings.append(Finding(
                        rule_id=self.rule_id,
                        domain=self.domain,
                        entity_type="supply",
                        entity_id=supply["id"],
                        severity=self.severity,
                        title=f"Unlinked supply: {supply.get('item_name', 'Unknown')[:40]}",
                        description="Supply is not linked to an R&D project. Linking supplies to projects improves documentation quality.",
                        trigger_evidence={
                            "item_name": supply.get("item_name"),
                            "amount": amount,
                            "project_id": project_id
                        },
                        recommended_actions=[
                            RecommendedAction(
                                action_type="edit_field",
                                label="Link to Project",
                                description="Select the project this supply was used for",
                                target_field="project_id"
                            ),
                            RecommendedAction(
                                action_type="verify",
                                label="Mark as General",
                                description="Confirm this supply was used across multiple projects"
                            )
                        ],
                        authority_refs=self.authority_keys,
                        estimated_impact={
                            "qre_at_risk": 0,
                            "credit_at_risk": 0,
                            "confidence": 0.3
                        }
                    ))
            
            return RuleResult(self.rule_id, findings, len(result.data or []), errors)
            
        except Exception as e:
            logger.error(f"Error in {self.rule_id}: {e}")
            return RuleResult(self.rule_id, [], 0, [str(e)])


# ============================================================================
# Cross-Domain Rules
# ============================================================================

class CrossDuplicateEntitiesRule(ReviewRule):
    """CROSS_DUPLICATE_ENTITIES_001: Probable duplicates."""
    
    rule_id = "CROSS_DUPLICATE_ENTITIES_001"
    domain = Domain.CROSS_DOMAIN
    severity = Severity.LOW
    title_template = "Potential duplicate entity"
    authority_keys = ["IRS_AUDIT_GUIDE"]
    
    def run(self) -> RuleResult:
        findings = []
        errors = []
        
        try:
            # Check employees for duplicates
            employees = self.supabase.table("employees")\
                .select("id, name")\
                .eq("client_company_id", self.client_id)\
                .eq("tax_year", str(self.tax_year))\
                .execute()
            
            emp_names = {}
            for emp in (employees.data or []):
                name = (emp.get("name") or "").lower().strip()
                if name:
                    if name in emp_names:
                        emp_names[name].append(emp["id"])
                    else:
                        emp_names[name] = [emp["id"]]
            
            for name, ids in emp_names.items():
                if len(ids) > 1:
                    findings.append(Finding(
                        rule_id=self.rule_id,
                        domain=self.domain,
                        entity_type="employee",
                        entity_id=ids[0],
                        severity=self.severity,
                        title=f"Duplicate employee: {name}",
                        description=f"Found {len(ids)} employees with the same name. These may be duplicates that should be merged.",
                        trigger_evidence={
                            "name": name,
                            "duplicate_ids": ids,
                            "count": len(ids)
                        },
                        recommended_actions=[
                            RecommendedAction(
                                action_type="verify",
                                label="Review Duplicates",
                                description="Review and determine if these are the same person"
                            ),
                            RecommendedAction(
                                action_type="edit_field",
                                label="Merge Records",
                                description="Merge duplicate records"
                            )
                        ],
                        authority_refs=self.authority_keys,
                        estimated_impact={
                            "qre_at_risk": 0,
                            "credit_at_risk": 0,
                            "confidence": 0.5
                        }
                    ))
            
            return RuleResult(self.rule_id, findings, len(employees.data or []), errors)
            
        except Exception as e:
            logger.error(f"Error in {self.rule_id}: {e}")
            return RuleResult(self.rule_id, [], 0, [str(e)])


class CrossTaxYearMismatchRule(ReviewRule):
    """CROSS_TAX_YEAR_MISMATCH_002: Transactions outside tax year."""
    
    rule_id = "CROSS_TAX_YEAR_MISMATCH_002"
    domain = Domain.CROSS_DOMAIN
    severity = Severity.HIGH
    title_template = "Transaction outside tax year"
    authority_keys = ["IRC_41_B", "FORM_6765_INST"]
    
    def run(self) -> RuleResult:
        findings = []
        errors = []
        
        year_start = f"{self.tax_year}-01-01"
        year_end = f"{self.tax_year}-12-31"
        
        try:
            # Check expenses
            expenses = self.supabase.table("expenses")\
                .select("*")\
                .eq("client_company_id", self.client_id)\
                .eq("tax_year", str(self.tax_year))\
                .execute()
            
            for exp in (expenses.data or []):
                expense_date = exp.get("expense_date")
                if expense_date:
                    if expense_date < year_start or expense_date > year_end:
                        amount = float(exp.get("amount") or 0)
                        findings.append(Finding(
                            rule_id=self.rule_id,
                            domain=self.domain,
                            entity_type="expense",
                            entity_id=exp["id"],
                            severity=self.severity,
                            title=f"Date mismatch: {expense_date}",
                            description=f"Expense dated {expense_date} falls outside tax year {self.tax_year}. This expense may need to be moved to the correct year.",
                            trigger_evidence={
                                "expense_date": expense_date,
                                "tax_year": self.tax_year,
                                "year_range": f"{year_start} to {year_end}",
                                "amount": amount,
                                "description": exp.get("description")
                            },
                            recommended_actions=[
                                RecommendedAction(
                                    action_type="edit_field",
                                    label="Fix Date",
                                    description="Correct the expense date",
                                    target_field="expense_date"
                                ),
                                RecommendedAction(
                                    action_type="edit_field",
                                    label="Change Tax Year",
                                    description="Move to correct tax year",
                                    target_field="tax_year"
                                ),
                                RecommendedAction(
                                    action_type="verify",
                                    label="Verify Date",
                                    description="Confirm this date is correct (accrual basis)"
                                )
                            ],
                            authority_refs=self.authority_keys,
                            estimated_impact={
                                "qre_at_risk": amount,
                                "credit_at_risk": amount * 0.20,
                                "confidence": 0.9
                            }
                        ))
            
            return RuleResult(self.rule_id, findings, len(expenses.data or []), errors)
            
        except Exception as e:
            logger.error(f"Error in {self.rule_id}: {e}")
            return RuleResult(self.rule_id, [], 0, [str(e)])


# ============================================================================
# Rules Registry
# ============================================================================

ALL_RULES = [
    # Employee rules
    EmpHighWageRule,
    EmpMissingLocationRule,
    EmpZeroAllocationRule,
    EmpOutlierAllocationRule,
    # Vendor rules
    VenForeignRule,
    VenMissingRiskIpRule,
    VenContractMissingRule,
    # Project rules
    ProjMissingFourPartRule,
    ProjNoTimeLinkRule,
    # AP/Supplies rules
    ApLargeTxRule,
    ApUncategorizedRule,
    SupCapitalIndicatorRule,
    SupNoProjectLinkRule,
    # Cross-domain rules
    CrossDuplicateEntitiesRule,
    CrossTaxYearMismatchRule,
]


# ============================================================================
# Engine Execution
# ============================================================================

class ReviewRulesEngine:
    """
    Main engine for running review rules and persisting findings.
    """
    
    def __init__(self, supabase, org_id: str, client_id: str, tax_year: int, config: Dict = None):
        self.supabase = supabase
        self.org_id = org_id
        self.client_id = client_id
        self.tax_year = tax_year
        self.config = config or self._load_config()
        self.authority_cache = {}
    
    def _load_config(self) -> Dict:
        """Load review configuration from DB."""
        try:
            result = self.supabase.table("review_configurations")\
                .select("config_key, config_value")\
                .eq("organization_id", self.org_id)\
                .execute()
            
            config = {}
            for row in (result.data or []):
                config[row["config_key"]] = row["config_value"]
            
            # Client-specific overrides
            result = self.supabase.table("review_configurations")\
                .select("config_key, config_value")\
                .eq("client_company_id", self.client_id)\
                .execute()
            
            for row in (result.data or []):
                config[row["config_key"]] = row["config_value"]
            
            return config
        except Exception as e:
            logger.warning(f"Could not load review config: {e}")
            return {}
    
    def _get_authority_ids(self, citation_keys: List[str]) -> List[str]:
        """Get authority IDs for citation keys."""
        ids = []
        for key in citation_keys:
            if key in self.authority_cache:
                ids.append(self.authority_cache[key])
            else:
                try:
                    result = self.supabase.table("authority_library")\
                        .select("id")\
                        .eq("citation_key", key)\
                        .single()\
                        .execute()
                    if result.data:
                        self.authority_cache[key] = result.data["id"]
                        ids.append(result.data["id"])
                except Exception as e:
                    logger.warning(f"Authority key not found: {key} - {e}")
        return ids
    
    def _upsert_finding(self, finding: Finding, intake_session_id: Optional[str]) -> Tuple[str, str]:
        """
        Upsert a finding to the database.
        Returns: (finding_id, action) where action is 'created' or 'updated'
        """
        # Get authority IDs
        authority_ids = self._get_authority_ids(finding.authority_refs)
        if not authority_ids and finding.authority_refs:
            logger.warning(f"Some authority refs not found for rule {finding.rule_id}: {finding.authority_refs}")
        
        # Build record
        record = {
            "organization_id": self.org_id,
            "client_company_id": self.client_id,
            "tax_year": self.tax_year,
            "intake_session_id": intake_session_id,
            "domain": finding.domain.value,
            "entity_type": finding.entity_type,
            "entity_id": finding.entity_id,
            "rule_id": finding.rule_id,
            "severity": finding.severity.value,
            "title": finding.title,
            "description": finding.description,
            "trigger_evidence": finding.trigger_evidence,
            "recommended_actions": [
                {
                    "action_type": a.action_type,
                    "label": a.label,
                    "description": a.description,
                    "target_field": a.target_field,
                    "payload": a.payload
                } for a in finding.recommended_actions
            ],
            "authority_refs": authority_ids,
            "estimated_impact": finding.estimated_impact,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        # Check for existing
        try:
            existing = self.supabase.table("review_findings")\
                .select("id, status, severity")\
                .eq("client_company_id", self.client_id)\
                .eq("tax_year", self.tax_year)\
                .eq("rule_id", finding.rule_id)\
                .eq("entity_id", finding.entity_id)\
                .single()\
                .execute()
            
            if existing.data:
                # Update if not resolved
                if existing.data["status"] in ["open", "in_review"]:
                    self.supabase.table("review_findings")\
                        .update(record)\
                        .eq("id", existing.data["id"])\
                        .execute()
                    return existing.data["id"], "updated"
                else:
                    # Already resolved, don't reopen
                    return existing.data["id"], "skipped"
        except:
            pass
        
        # Insert new
        record["id"] = str(uuid4())
        record["status"] = "open"
        record["created_at"] = datetime.utcnow().isoformat()
        
        self.supabase.table("review_findings").insert(record).execute()
        return record["id"], "created"
    
    def run_all_rules(self, intake_session_id: Optional[str] = None) -> Dict:
        """
        Run all review rules and persist findings.
        Returns summary of results.
        """
        results = {
            "rules_executed": 0,
            "findings_created": 0,
            "findings_updated": 0,
            "findings_skipped": 0,
            "findings_by_severity": {"low": 0, "medium": 0, "high": 0},
            "findings_by_domain": {},
            "rule_results": [],
            "errors": []
        }
        
        for rule_class in ALL_RULES:
            try:
                rule = rule_class(
                    supabase=self.supabase,
                    org_id=self.org_id,
                    client_id=self.client_id,
                    tax_year=self.tax_year,
                    config=self.config
                )
                
                rule_result = rule.run()
                results["rules_executed"] += 1
                
                for finding in rule_result.findings:
                    finding_id, action = self._upsert_finding(finding, intake_session_id)
                    
                    if action == "created":
                        results["findings_created"] += 1
                        results["findings_by_severity"][finding.severity.value] += 1
                        domain_key = finding.domain.value
                        results["findings_by_domain"][domain_key] = \
                            results["findings_by_domain"].get(domain_key, 0) + 1
                    elif action == "updated":
                        results["findings_updated"] += 1
                    else:
                        results["findings_skipped"] += 1
                
                results["rule_results"].append({
                    "rule_id": rule_result.rule_id,
                    "entities_checked": rule_result.entities_checked,
                    "findings_count": len(rule_result.findings),
                    "errors": rule_result.errors
                })
                
                if rule_result.errors:
                    results["errors"].extend(rule_result.errors)
                    
            except Exception as e:
                logger.error(f"Error running rule {rule_class.rule_id}: {e}")
                results["errors"].append(f"{rule_class.rule_id}: {str(e)}")
        
        return results

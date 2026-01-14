"""
Credit Estimate Engine
Computes low/base/high credit range estimates with assumptions, 
data completeness scoring, and risk notes.

Integrates with:
- Canonical data tables (employees, expenses, time_logs, contractors)
- Review findings (Prompt 10)
- Escalations (Prompt 11)
- Existing QRE computation logic
"""

import logging
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from uuid import uuid4
from enum import Enum
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

# ============================================================================
# Data Classes for Estimates
# ============================================================================

@dataclass
class QRERange:
    """QRE breakdown for a single range (low/base/high)"""
    wage_qre: float = 0.0
    supply_qre: float = 0.0
    contract_qre: float = 0.0
    total_qre: float = 0.0
    credit_amount_regular: Optional[float] = None
    credit_amount_asc: Optional[float] = None
    credit_amount_selected: Optional[float] = None
    effective_rate: Optional[float] = None
    
    def to_dict(self) -> dict:
        return {
            "wage_qre": round(self.wage_qre, 2),
            "supply_qre": round(self.supply_qre, 2),
            "contract_qre": round(self.contract_qre, 2),
            "total_qre": round(self.total_qre, 2),
            "credit_amount_regular": round(self.credit_amount_regular, 2) if self.credit_amount_regular else None,
            "credit_amount_asc": round(self.credit_amount_asc, 2) if self.credit_amount_asc else None,
            "credit_amount_selected": round(self.credit_amount_selected, 2) if self.credit_amount_selected else None,
            "effective_rate": round(self.effective_rate, 4) if self.effective_rate else None,
        }


@dataclass
class Assumption:
    """Structured assumption affecting the estimate"""
    assumption_id: str
    title: str
    description: str
    impact_direction: str  # increases | decreases | uncertain
    impact_band: str  # low | medium | high
    numeric_effect: Optional[dict] = None  # {wage_qre_delta: 25000}
    source: str = "system_default"  # system_default | user_entered | senior_override
    linked_finding_ids: Optional[List[str]] = None
    
    def to_dict(self) -> dict:
        return {
            "assumption_id": self.assumption_id,
            "title": self.title,
            "description": self.description,
            "impact_direction": self.impact_direction,
            "impact_band": self.impact_band,
            "numeric_effect": self.numeric_effect,
            "source": self.source,
            "linked_finding_ids": self.linked_finding_ids or [],
        }


@dataclass 
class RiskNote:
    """Structured risk note affecting confidence"""
    risk_id: str
    title: str
    severity: str  # low | medium | high
    reason: str
    authority_refs: Optional[List[str]] = None
    linked_finding_ids: Optional[List[str]] = None
    
    def to_dict(self) -> dict:
        return {
            "risk_id": self.risk_id,
            "title": self.title,
            "severity": self.severity,
            "reason": self.reason,
            "authority_refs": self.authority_refs or [],
            "linked_finding_ids": self.linked_finding_ids or [],
        }


# ============================================================================
# Credit Computation Constants
# ============================================================================

# Regular Credit (20% of QRE over base amount)
REGULAR_CREDIT_RATE = 0.20

# ASC Credit (14% of QRE over 50% of base, capped)
ASC_CREDIT_RATE = 0.14
ASC_BASE_PERCENTAGE = 0.50

# Contract Research - 65% rule
CONTRACT_QRE_RATE = 0.65

# Default effective rate when base amount unknown (preliminary estimate)
DEFAULT_EFFECTIVE_RATE = 0.065  # ~6.5% for startups using ASC

# Conservative allocation cap when timesheets missing
CONSERVATIVE_ALLOCATION_CAP = 0.30  # 30% max allocation without time support

# Foreign vendor exclusion (default exclude in low case)
FOREIGN_VENDOR_INCLUDE_THRESHOLD = 0.0  # 0% in low case


# ============================================================================
# Credit Estimate Engine Class
# ============================================================================

class CreditEstimateEngine:
    """
    Computes credit range estimates from canonical data with 
    adjustments for findings, escalations, and data quality.
    """
    
    def __init__(self, supabase, org_id: str, client_id: str, tax_year: int):
        self.supabase = supabase
        self.org_id = org_id
        self.client_id = client_id
        self.tax_year = tax_year
        
        # Data containers
        self.employees = []
        self.expenses = []
        self.contractors = []
        self.time_logs = []
        self.projects = []
        self.findings = []
        self.escalations = []
        self.expected_inputs = []
        
        # Results
        self.assumptions = []
        self.risk_notes = []
        self.missing_inputs = []
        
    def load_data(self):
        """Load all relevant data for computation."""
        
        # Employees
        emp_result = self.supabase.table("employees")\
            .select("*")\
            .eq("client_company_id", self.client_id)\
            .eq("tax_year", self.tax_year)\
            .execute()
        self.employees = emp_result.data or []
        
        # Expenses (supplies)
        exp_result = self.supabase.table("expenses")\
            .select("*")\
            .eq("client_company_id", self.client_id)\
            .eq("tax_year", self.tax_year)\
            .execute()
        self.expenses = exp_result.data or []
        
        # Contractors
        con_result = self.supabase.table("contractors")\
            .select("*")\
            .eq("client_company_id", self.client_id)\
            .execute()
        self.contractors = con_result.data or []
        
        # Time logs
        try:
            time_result = self.supabase.table("time_logs")\
                .select("*")\
                .eq("client_company_id", self.client_id)\
                .eq("tax_year", self.tax_year)\
                .execute()
            self.time_logs = time_result.data or []
        except:
            self.time_logs = []
        
        # Projects
        proj_result = self.supabase.table("projects")\
            .select("*")\
            .eq("client_company_id", self.client_id)\
            .execute()
        self.projects = proj_result.data or []
        
        # Open findings (from review system)
        try:
            findings_result = self.supabase.table("review_findings")\
                .select("*")\
                .eq("client_company_id", self.client_id)\
                .eq("tax_year", self.tax_year)\
                .in_("status", ["open", "in_review"])\
                .execute()
            self.findings = findings_result.data or []
        except:
            self.findings = []
        
        # Open escalations
        try:
            esc_result = self.supabase.table("escalation_requests")\
                .select("*")\
                .eq("client_company_id", self.client_id)\
                .in_("status", ["queued", "assigned", "in_review"])\
                .execute()
            self.escalations = esc_result.data or []
        except:
            self.escalations = []
        
        # Expected inputs from intake session
        try:
            session_result = self.supabase.table("client_intake_sessions")\
                .select("expected_inputs")\
                .eq("client_company_id", self.client_id)\
                .order("created_at", desc=True)\
                .limit(1)\
                .execute()
            if session_result.data:
                self.expected_inputs = session_result.data[0].get("expected_inputs", {})
        except:
            self.expected_inputs = {}
            
    def compute_estimate(self, 
                         methodology: str = "both",
                         range_strategy: dict = None) -> dict:
        """
        Compute the full credit estimate with low/base/high ranges.
        
        Args:
            methodology: 'regular', 'asc', or 'both'
            range_strategy: Optional overrides for conservative/aggressive
            
        Returns:
            Complete estimate dict ready for database storage
        """
        # Load fresh data
        self.load_data()
        
        # Reset results
        self.assumptions = []
        self.risk_notes = []
        self.missing_inputs = []
        
        # Parse range strategy
        strategy = range_strategy or {}
        conservative = strategy.get("conservative", False)
        
        # Compute base case first
        base_range = self._compute_base_case()
        
        # Compute low case (conservative adjustments)
        low_range = self._compute_low_case(base_range)
        
        # Compute high case (optimistic adjustments)
        high_range = self._compute_high_case(base_range)
        
        # Apply credit calculation to all ranges
        self._apply_credit_calculation(low_range, methodology)
        self._apply_credit_calculation(base_range, methodology)
        self._apply_credit_calculation(high_range, methodology)
        
        # Compute data completeness
        completeness_score = self._compute_completeness_score()
        
        # Gather missing inputs
        self._gather_missing_inputs()
        
        # Add system risk notes based on findings
        self._add_risk_notes_from_findings()
        
        return {
            "range_low": low_range.to_dict(),
            "range_base": base_range.to_dict(),
            "range_high": high_range.to_dict(),
            "assumptions": [a.to_dict() for a in self.assumptions],
            "risk_notes": [r.to_dict() for r in self.risk_notes],
            "missing_inputs": self.missing_inputs,
            "data_completeness_score": completeness_score,
        }
    
    def _compute_base_case(self) -> QRERange:
        """Compute base case QRE using current data at face value."""
        
        # Wage QRE
        wage_qre = 0.0
        for emp in self.employees:
            wages = float(emp.get("total_wages") or emp.get("w2_wages") or 0)
            rd_pct = float(emp.get("rd_allocation_percent") or emp.get("rd_percentage") or 0) / 100
            qre_wage = emp.get("qre_wage_base")
            
            if qre_wage:
                wage_qre += float(qre_wage)
            else:
                wage_qre += wages * rd_pct
        
        # Supply QRE
        supply_qre = 0.0
        for exp in self.expenses:
            if exp.get("is_qre_eligible"):
                supply_qre += float(exp.get("qre_amount") or exp.get("amount") or 0)
        
        # Contract QRE (65% of qualified contract research)
        contract_qre = 0.0
        for con in self.contractors:
            if con.get("is_qualified"):
                amount = float(con.get("total_cost") or con.get("amount") or 0)
                contract_qre += amount * CONTRACT_QRE_RATE
        
        # Also include AP transactions marked as contract research
        for exp in self.expenses:
            if exp.get("category") == "contract_research" and exp.get("qre_eligible_percent", 0) > 0:
                amount = float(exp.get("amount") or 0)
                pct = float(exp.get("qre_eligible_percent") or 100) / 100
                contract_qre += amount * pct * CONTRACT_QRE_RATE
        
        total_qre = wage_qre + supply_qre + contract_qre
        
        self.assumptions.append(Assumption(
            assumption_id="BASE_CURRENT_DATA",
            title="Current data used at face value",
            description="Base case uses existing R&D allocations and classifications without adjustment.",
            impact_direction="uncertain",
            impact_band="low",
            source="system_default"
        ))
        
        return QRERange(
            wage_qre=wage_qre,
            supply_qre=supply_qre,
            contract_qre=contract_qre,
            total_qre=total_qre
        )
    
    def _compute_low_case(self, base: QRERange) -> QRERange:
        """
        Compute low case with conservative adjustments:
        - Exclude/haircut items with unresolved high severity findings
        - Cap allocations if timesheets missing
        - Exclude foreign vendor costs
        """
        
        wage_qre = base.wage_qre
        supply_qre = base.supply_qre
        contract_qre = base.contract_qre
        
        # Track adjustments
        wage_adjustment = 0.0
        supply_adjustment = 0.0
        contract_adjustment = 0.0
        
        # 1. Adjust for high severity findings
        high_sev_findings = [f for f in self.findings if f.get("severity") == "high"]
        
        for finding in high_sev_findings:
            impact = finding.get("estimated_impact") or {}
            qre_at_risk = float(impact.get("qre_at_risk") or 0)
            domain = finding.get("domain")
            
            if qre_at_risk > 0:
                if domain in ["employees", "timesheets"]:
                    # Haircut wage QRE by 50% of at-risk amount
                    haircut = qre_at_risk * 0.5
                    wage_adjustment -= haircut
                    
                    self.assumptions.append(Assumption(
                        assumption_id=f"LOW_FINDING_{finding.get('id', 'unknown')[:8]}",
                        title=f"Wage haircut for: {finding.get('title', 'Unknown finding')}",
                        description=f"Reduced wage QRE by ${haircut:,.0f} due to unresolved high severity finding.",
                        impact_direction="decreases",
                        impact_band="high",
                        numeric_effect={"wage_qre_delta": -haircut},
                        source="system_default",
                        linked_finding_ids=[finding.get("id")]
                    ))
                    
                elif domain in ["vendors", "contracts"]:
                    # Full exclusion for contract issues
                    contract_adjustment -= qre_at_risk
                    
                    self.assumptions.append(Assumption(
                        assumption_id=f"LOW_CONTRACT_{finding.get('id', 'unknown')[:8]}",
                        title=f"Contract exclusion for: {finding.get('title', 'Unknown')}",
                        description=f"Excluded ${qre_at_risk:,.0f} contract QRE due to unresolved vendor finding.",
                        impact_direction="decreases",
                        impact_band="high",
                        numeric_effect={"contract_qre_delta": -qre_at_risk},
                        source="system_default",
                        linked_finding_ids=[finding.get("id")]
                    ))
                    
                elif domain in ["ap_transactions", "supplies"]:
                    supply_adjustment -= qre_at_risk * 0.5
        
        # 2. Cap allocations if no timesheets
        if not self.time_logs:
            # Check how many employees have allocations > 30%
            overcapped_wage = 0.0
            for emp in self.employees:
                wages = float(emp.get("total_wages") or emp.get("w2_wages") or 0)
                rd_pct = float(emp.get("rd_allocation_percent") or emp.get("rd_percentage") or 0) / 100
                
                if rd_pct > CONSERVATIVE_ALLOCATION_CAP:
                    # Cap at 30% in low case
                    current_qre = wages * rd_pct
                    capped_qre = wages * CONSERVATIVE_ALLOCATION_CAP
                    overcapped_wage += (current_qre - capped_qre)
            
            if overcapped_wage > 0:
                wage_adjustment -= overcapped_wage
                
                self.assumptions.append(Assumption(
                    assumption_id="LOW_ALLOCATION_CAP",
                    title="Allocation cap without timesheet support",
                    description=f"Capped R&D allocations at {CONSERVATIVE_ALLOCATION_CAP*100:.0f}% for employees without timesheet support. Reduced by ${overcapped_wage:,.0f}.",
                    impact_direction="decreases",
                    impact_band="medium",
                    numeric_effect={"wage_qre_delta": -overcapped_wage},
                    source="system_default"
                ))
        
        # 3. Exclude foreign vendor costs
        foreign_contract_qre = 0.0
        for con in self.contractors:
            if con.get("country") and con.get("country").upper() != "US":
                amount = float(con.get("total_cost") or con.get("amount") or 0)
                foreign_contract_qre += amount * CONTRACT_QRE_RATE
        
        if foreign_contract_qre > 0:
            contract_adjustment -= foreign_contract_qre
            
            self.assumptions.append(Assumption(
                assumption_id="LOW_FOREIGN_EXCLUSION",
                title="Foreign vendor exclusion",
                description=f"Excluded ${foreign_contract_qre:,.0f} for foreign vendors (research not performed in US).",
                impact_direction="decreases",
                impact_band="medium",
                numeric_effect={"contract_qre_delta": -foreign_contract_qre},
                source="system_default"
            ))
        
        # Apply adjustments
        low_wage = max(0, wage_qre + wage_adjustment)
        low_supply = max(0, supply_qre + supply_adjustment)
        low_contract = max(0, contract_qre + contract_adjustment)
        
        return QRERange(
            wage_qre=low_wage,
            supply_qre=low_supply,
            contract_qre=low_contract,
            total_qre=low_wage + low_supply + low_contract
        )
    
    def _compute_high_case(self, base: QRERange) -> QRERange:
        """
        Compute high case with optimistic adjustments:
        - Include pending classification items with justified assumptions
        - Allow higher allocation bounds if partial timesheet support
        - Include more contract research with IP ownership assumptions
        """
        
        wage_qre = base.wage_qre
        supply_qre = base.supply_qre
        contract_qre = base.contract_qre
        
        # Track adjustments
        wage_adjustment = 0.0
        supply_adjustment = 0.0
        contract_adjustment = 0.0
        
        # 1. Include unclassified AP transactions as potential supplies
        unclassified_amount = 0.0
        for exp in self.expenses:
            if exp.get("category") in [None, "", "unknown", "uncategorized"]:
                amount = float(exp.get("amount") or 0)
                unclassified_amount += amount
        
        if unclassified_amount > 0:
            # Assume 30% of unclassified could be supplies
            potential_supply = unclassified_amount * 0.3
            supply_adjustment += potential_supply
            
            self.assumptions.append(Assumption(
                assumption_id="HIGH_UNCLASSIFIED_SUPPLIES",
                title="Potential supplies in unclassified transactions",
                description=f"Assumed 30% of ${unclassified_amount:,.0f} unclassified transactions may qualify as supplies. Added ${potential_supply:,.0f}.",
                impact_direction="increases",
                impact_band="medium",
                numeric_effect={"supply_qre_delta": potential_supply},
                source="system_default"
            ))
        
        # 2. Increase allocation bounds if partial timesheets exist
        if self.time_logs:
            # Employees with some time support but low allocation might be underallocated
            for emp in self.employees:
                wages = float(emp.get("total_wages") or emp.get("w2_wages") or 0)
                rd_pct = float(emp.get("rd_allocation_percent") or emp.get("rd_percentage") or 0) / 100
                
                # Check if employee has time logs
                emp_id = emp.get("id")
                emp_time = [t for t in self.time_logs if t.get("employee_id") == emp_id]
                
                if emp_time and rd_pct < 0.5:
                    # Calculate time-based allocation
                    total_hours = sum(float(t.get("hours") or 0) for t in emp_time)
                    rd_hours = sum(float(t.get("hours") or 0) for t in emp_time 
                                   if t.get("project_id") and any(
                                       p.get("id") == t.get("project_id") and 
                                       p.get("qualification_status") == "qualified"
                                       for p in self.projects
                                   ))
                    
                    if total_hours > 0:
                        time_based_pct = min(0.8, rd_hours / total_hours)
                        if time_based_pct > rd_pct:
                            additional_qre = wages * (time_based_pct - rd_pct)
                            wage_adjustment += additional_qre
        
        if wage_adjustment > 0:
            self.assumptions.append(Assumption(
                assumption_id="HIGH_TIME_ALLOCATION",
                title="Time-based allocation uplift",
                description=f"Increased wage QRE by ${wage_adjustment:,.0f} based on timesheet analysis showing higher R&D allocation potential.",
                impact_direction="increases",
                impact_band="medium",
                numeric_effect={"wage_qre_delta": wage_adjustment},
                source="system_default"
            ))
        
        # 3. Include qualified contractors with IP ownership assumption
        for con in self.contractors:
            if con.get("is_qualified") is None and con.get("country", "US").upper() == "US":
                amount = float(con.get("total_cost") or con.get("amount") or 0)
                # Assume qualified with favorable IP terms
                additional = amount * CONTRACT_QRE_RATE
                contract_adjustment += additional
        
        if contract_adjustment > 0:
            self.assumptions.append(Assumption(
                assumption_id="HIGH_CONTRACTOR_INCLUSION",
                title="Unclassified US contractors assumed qualified",
                description=f"Included ${contract_adjustment:,.0f} for US contractors pending qualification, assuming favorable IP ownership terms.",
                impact_direction="increases",
                impact_band="medium",
                numeric_effect={"contract_qre_delta": contract_adjustment},
                source="system_default"
            ))
        
        # Apply adjustments
        high_wage = wage_qre + wage_adjustment
        high_supply = supply_qre + supply_adjustment
        high_contract = contract_qre + contract_adjustment
        
        return QRERange(
            wage_qre=high_wage,
            supply_qre=high_supply,
            contract_qre=high_contract,
            total_qre=high_wage + high_supply + high_contract
        )
    
    def _apply_credit_calculation(self, range_obj: QRERange, methodology: str):
        """
        Apply credit calculation to a QRE range.
        Uses ASC method as primary (most common for startups).
        """
        
        total_qre = range_obj.total_qre
        
        # Check if we have base amount data (prior years)
        has_base_amount = self._has_base_amount_data()
        
        if has_base_amount:
            # Full Regular Credit calculation
            base_amount = self._get_base_amount()
            if total_qre > base_amount:
                range_obj.credit_amount_regular = (total_qre - base_amount) * REGULAR_CREDIT_RATE
            else:
                range_obj.credit_amount_regular = 0
            
            # Full ASC calculation
            asc_base = base_amount * ASC_BASE_PERCENTAGE
            if total_qre > asc_base:
                range_obj.credit_amount_asc = (total_qre - asc_base) * ASC_CREDIT_RATE
            else:
                range_obj.credit_amount_asc = total_qre * ASC_CREDIT_RATE * 0.06  # Fallback
        else:
            # Use effective rate estimate (preliminary)
            range_obj.credit_amount_regular = total_qre * DEFAULT_EFFECTIVE_RATE
            range_obj.credit_amount_asc = total_qre * DEFAULT_EFFECTIVE_RATE
            
            # Add assumption about preliminary nature
            if not any(a.assumption_id == "PRELIMINARY_NO_BASE" for a in self.assumptions):
                self.assumptions.append(Assumption(
                    assumption_id="PRELIMINARY_NO_BASE",
                    title="Preliminary estimate without base amount",
                    description=f"Credit calculated using {DEFAULT_EFFECTIVE_RATE*100:.1f}% effective rate. Final requires prior year base amount data.",
                    impact_direction="uncertain",
                    impact_band="high",
                    source="system_default"
                ))
                
                self.risk_notes.append(RiskNote(
                    risk_id="RISK_NO_BASE_AMOUNT",
                    title="Missing base amount data",
                    severity="high",
                    reason="Prior year gross receipts and QRE needed for accurate Regular/ASC credit calculation. Current estimate uses simplified effective rate."
                ))
        
        # Select credit based on methodology
        if methodology == "regular":
            range_obj.credit_amount_selected = range_obj.credit_amount_regular
        elif methodology == "asc":
            range_obj.credit_amount_selected = range_obj.credit_amount_asc
        else:  # both - use higher
            range_obj.credit_amount_selected = max(
                range_obj.credit_amount_regular or 0,
                range_obj.credit_amount_asc or 0
            )
        
        # Calculate effective rate
        if total_qre > 0 and range_obj.credit_amount_selected:
            range_obj.effective_rate = range_obj.credit_amount_selected / total_qre
    
    def _has_base_amount_data(self) -> bool:
        """Check if we have sufficient data for base amount calculation."""
        # TODO: Check for prior year data in a base_amounts table
        # For now, return False to use preliminary method
        return False
    
    def _get_base_amount(self) -> float:
        """Get the base amount for Regular Credit calculation."""
        # TODO: Implement base amount lookup from prior years
        return 0.0
    
    def _compute_completeness_score(self) -> float:
        """
        Compute data completeness score (0-1).
        Based on expected inputs vs received.
        """
        
        score_components = []
        
        # 1. Employee data completeness
        if self.employees:
            emp_with_allocation = sum(1 for e in self.employees 
                                      if e.get("rd_allocation_percent") or e.get("rd_percentage"))
            emp_completeness = emp_with_allocation / len(self.employees) if self.employees else 0
            score_components.append(("employees", emp_completeness, 0.3))
        else:
            score_components.append(("employees", 0, 0.3))
        
        # 2. Time log support
        time_support = 1.0 if self.time_logs else 0.3
        score_components.append(("timesheets", time_support, 0.25))
        
        # 3. Contractor qualification
        if self.contractors:
            qualified = sum(1 for c in self.contractors if c.get("is_qualified") is not None)
            contractor_completeness = qualified / len(self.contractors)
            score_components.append(("contractors", contractor_completeness, 0.2))
        else:
            score_components.append(("contractors", 0.5, 0.2))  # No contractors is OK
        
        # 4. Project narratives
        if self.projects:
            with_narratives = sum(1 for p in self.projects 
                                  if p.get("uncertainty_statement") and p.get("experimentation_description"))
            project_completeness = with_narratives / len(self.projects)
            score_components.append(("projects", project_completeness, 0.15))
        else:
            score_components.append(("projects", 0, 0.15))
        
        # 5. Open findings penalty
        high_findings = len([f for f in self.findings if f.get("severity") == "high"])
        finding_penalty = max(0, 1 - (high_findings * 0.1))
        score_components.append(("findings", finding_penalty, 0.1))
        
        # Weighted average
        total_score = sum(score * weight for _, score, weight in score_components)
        
        return round(total_score, 2)
    
    def _gather_missing_inputs(self):
        """Gather list of missing inputs affecting the estimate."""
        
        # From expected_inputs
        if isinstance(self.expected_inputs, dict):
            for input_key, input_data in self.expected_inputs.items():
                if isinstance(input_data, dict) and not input_data.get("received"):
                    self.missing_inputs.append({
                        "input_key": input_key,
                        "label": input_data.get("label", input_key),
                        "impact": input_data.get("impact", "unknown"),
                        "source": "intake_expected"
                    })
        
        # From findings
        for finding in self.findings:
            if finding.get("severity") in ["high", "medium"]:
                self.missing_inputs.append({
                    "input_key": f"finding_{finding.get('id', 'unknown')[:8]}",
                    "label": finding.get("title", "Unresolved finding"),
                    "impact": "Affects estimate confidence",
                    "source": "review_finding",
                    "finding_id": finding.get("id")
                })
        
        # Check for specific missing items
        if not self.time_logs:
            self.missing_inputs.append({
                "input_key": "timesheets",
                "label": "Time logs/timesheets",
                "impact": "Required for allocation support",
                "source": "system_check"
            })
        
        if not self.projects:
            self.missing_inputs.append({
                "input_key": "projects",
                "label": "R&D Project list",
                "impact": "Required for qualification",
                "source": "system_check"
            })
    
    def _add_risk_notes_from_findings(self):
        """Add risk notes based on open findings."""
        
        # High severity findings
        high_findings = [f for f in self.findings if f.get("severity") == "high"]
        if high_findings:
            self.risk_notes.append(RiskNote(
                risk_id="RISK_HIGH_SEVERITY_FINDINGS",
                title=f"{len(high_findings)} high severity finding(s) unresolved",
                severity="high",
                reason="These findings may materially affect the credit calculation and should be resolved before finalizing.",
                linked_finding_ids=[f.get("id") for f in high_findings]
            ))
        
        # Foreign vendor exposure
        foreign_vendors = [c for c in self.contractors 
                          if c.get("country") and c.get("country").upper() != "US"]
        if foreign_vendors:
            self.risk_notes.append(RiskNote(
                risk_id="RISK_FOREIGN_VENDORS",
                title="Foreign vendor exposure",
                severity="medium",
                reason=f"{len(foreign_vendors)} vendor(s) are non-US. Research must be performed in the US to qualify.",
                authority_refs=["IRC_41_D_4_FOREIGN"]
            ))
        
        # Missing narratives
        projects_without_narratives = [p for p in self.projects 
                                       if not p.get("uncertainty_statement") or not p.get("experimentation_description")]
        if projects_without_narratives:
            self.risk_notes.append(RiskNote(
                risk_id="RISK_MISSING_NARRATIVES",
                title="Projects missing four-part test documentation",
                severity="medium",
                reason=f"{len(projects_without_narratives)} project(s) need uncertainty and experimentation documentation for audit defense.",
                authority_refs=["IRC_41_D"]
            ))
        
        # Open escalations
        if self.escalations:
            self.risk_notes.append(RiskNote(
                risk_id="RISK_PENDING_ESCALATIONS",
                title=f"{len(self.escalations)} pending escalation(s)",
                severity="medium",
                reason="Senior review items are pending that may affect the estimate."
            ))

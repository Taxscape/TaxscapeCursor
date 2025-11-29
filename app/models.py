from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    company_name = Column(String)

    # Relationships
    projects = relationship("Project", back_populates="user")
    employees = relationship("Employee", back_populates="user")

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))  # Linked to User
    name = Column(String, index=True)
    description = Column(Text)
    technical_uncertainty = Column(Text)
    process_of_experimentation = Column(Text)
    
    user = relationship("User", back_populates="projects")
    allocations = relationship("ProjectAllocation", back_populates="project")
    contractors = relationship("Contractor", back_populates="project")

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id")) # Linked to User
    name = Column(String, index=True)
    title = Column(String)
    total_wages = Column(Float)
    state = Column(String)

    user = relationship("User", back_populates="employees")
    allocations = relationship("ProjectAllocation", back_populates="employee")

class ProjectAllocation(Base):
    __tablename__ = "project_allocations"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"))
    project_id = Column(Integer, ForeignKey("projects.id"))
    allocation_percent = Column(Float) 

    employee = relationship("Employee", back_populates="allocations")
    project = relationship("Project", back_populates="allocations")

class Contractor(Base):
    __tablename__ = "contractors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    cost = Column(Float)
    is_qualified = Column(Boolean, default=True) 
    project_id = Column(Integer, ForeignKey("projects.id"))

    project = relationship("Project", back_populates="contractors")

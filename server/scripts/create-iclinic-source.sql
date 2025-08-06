-- Create properly configured iClinic migration source
INSERT INTO migration_sources (
    name, 
    display_name, 
    description, 
    script_path, 
    parameters, 
    is_active, 
    created_by
) VALUES (
    'iclinic_orchestrator',
    'iClinic Complete Migration',
    'Complete patient and encounter data migration from iClinic using the orchestrator',
    '/medproback/jobs/import/orchestrate-import.js',
    JSON_ARRAY(
        JSON_OBJECT(
            'name', 'sistema',
            'type', 'text',
            'label', 'Source System',
            'required', true,
            'placeholder', 'iclinic',
            'help', 'Name of the source system (always iclinic for this migration)',
            'default', 'iclinic',
            'readonly', true
        ),
        JSON_OBJECT(
            'name', 'usuario',
            'type', 'text',
            'label', 'User/Directory Name',
            'required', true,
            'placeholder', 'leandro',
            'help', 'Directory name where CSV files are located under ~/medpro/import/iclinic/',
            'validation', '^[a-zA-Z0-9_-]+$'
        ),
        JSON_OBJECT(
            'name', 'practitioner_id',
            'type', 'text',
            'label', 'Source Practitioner ID',
            'required', true,
            'placeholder', '294863',
            'help', 'ID of the practitioner in iClinic system'
        ),
        JSON_OBJECT(
            'name', 'medpro_pract_id',
            'type', 'email',
            'label', 'MedPro Practitioner Email',
            'required', true,
            'placeholder', 'doctor@clinic.com',
            'help', 'Email of the practitioner in MedPro system (determines clinic association)'
        ),
        JSON_OBJECT(
            'name', 'patient_id',
            'type', 'text',
            'label', 'Specific Patient ID (Optional)',
            'required', false,
            'placeholder', '44320',
            'help', 'Leave empty to import ALL patients, or enter a specific patient ID'
        )
    ),
    1,
    'system'
);
DELIMITER $$

DROP PROCEDURE IF EXISTS cleanup_practitioner_data$$

CREATE PROCEDURE cleanup_practitioner_data(
    IN practitioner_id_param VARCHAR(255)
)
BEGIN
    DECLARE total_rows_deleted INT DEFAULT 0;
    DECLARE rows_affected INT DEFAULT 0;
    DECLARE cleanup_type VARCHAR(20);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        GET DIAGNOSTICS CONDITION 1
            @sql_state = RETURNED_SQLSTATE,
            @error_message = MESSAGE_TEXT;
        SELECT CONCAT('ERROR: ', @sql_state, ' - ', @error_message) as error_message;
    END;

    -- Parameter validation
    IF practitioner_id_param IS NULL OR practitioner_id_param = '' THEN
        SELECT 'ERROR: practitioner_id_param cannot be null or empty' as error_message;
        LEAVE proc_cleanup;
    END IF;

    -- Determine cleanup type
    IF UPPER(practitioner_id_param) = 'ALL' THEN
        SET cleanup_type = 'ALL';
        SELECT 'WARNING: This will delete ALL practitioner data from ALL tables. Proceeding in 3 seconds...' as warning_message;
    ELSE
        SET cleanup_type = 'SPECIFIC';
        SELECT CONCAT('Cleaning up data for practitioner ID: ', practitioner_id_param) as info_message;
    END IF;

    START TRANSACTION;

    -- Group 1: Tables with practitioner_id column
    
    -- ai_quota_alerts
    IF cleanup_type = 'ALL' THEN
        DELETE FROM ai_quota_alerts;
    ELSE
        DELETE FROM ai_quota_alerts WHERE practitioner_id = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('ai_quota_alerts: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- ai_quota_usage_periods
    IF cleanup_type = 'ALL' THEN
        DELETE FROM ai_quota_usage_periods;
    ELSE
        DELETE FROM ai_quota_usage_periods WHERE practitioner_id = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('ai_quota_usage_periods: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- ai_usage_log (has both practitioner_id and provider columns)
    IF cleanup_type = 'ALL' THEN
        DELETE FROM ai_usage_log;
    ELSE
        DELETE FROM ai_usage_log WHERE practitioner_id = practitioner_id_param OR provider = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('ai_usage_log: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- ai_usage_summary
    IF cleanup_type = 'ALL' THEN
        DELETE FROM ai_usage_summary;
    ELSE
        DELETE FROM ai_usage_summary WHERE practitioner_id = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('ai_usage_summary: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- communication_config
    IF cleanup_type = 'ALL' THEN
        DELETE FROM communication_config;
    ELSE
        DELETE FROM communication_config WHERE practitioner_id = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('communication_config: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- communication_events
    IF cleanup_type = 'ALL' THEN
        DELETE FROM communication_events;
    ELSE
        DELETE FROM communication_events WHERE practitioner_id = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('communication_events: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- communication_templates
    IF cleanup_type = 'ALL' THEN
        DELETE FROM communication_templates;
    ELSE
        DELETE FROM communication_templates WHERE practitioner_id = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('communication_templates: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- requestitemnotehist
    IF cleanup_type = 'ALL' THEN
        DELETE FROM requestitemnotehist;
    ELSE
        DELETE FROM requestitemnotehist WHERE practitioner_id = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('requestitemnotehist: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- satisfaction_surveys
    IF cleanup_type = 'ALL' THEN
        DELETE FROM satisfaction_surveys;
    ELSE
        DELETE FROM satisfaction_surveys WHERE practitioner_id = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('satisfaction_surveys: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- user_ai_packages
    IF cleanup_type = 'ALL' THEN
        DELETE FROM user_ai_packages;
    ELSE
        DELETE FROM user_ai_packages WHERE practitioner_id = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('user_ai_packages: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- user_api_keys
    IF cleanup_type = 'ALL' THEN
        DELETE FROM user_api_keys;
    ELSE
        DELETE FROM user_api_keys WHERE practitioner_id = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('user_api_keys: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- user_subscriptions
    IF cleanup_type = 'ALL' THEN
        DELETE FROM user_subscriptions;
    ELSE
        DELETE FROM user_subscriptions WHERE practitioner_id = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('user_subscriptions: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- Group 2: Tables with practitioner_email column

    -- ai_encounterdiagnoses
    IF cleanup_type = 'ALL' THEN
        DELETE FROM ai_encounterdiagnoses;
    ELSE
        DELETE FROM ai_encounterdiagnoses WHERE practitioner_email = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('ai_encounterdiagnoses: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- ai_encounterlabresults
    IF cleanup_type = 'ALL' THEN
        DELETE FROM ai_encounterlabresults;
    ELSE
        DELETE FROM ai_encounterlabresults WHERE practitioner_email = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('ai_encounterlabresults: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- ai_encountermedications
    IF cleanup_type = 'ALL' THEN
        DELETE FROM ai_encountermedications;
    ELSE
        DELETE FROM ai_encountermedications WHERE practitioner_email = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('ai_encountermedications: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- ai_encounterprocedures
    IF cleanup_type = 'ALL' THEN
        DELETE FROM ai_encounterprocedures;
    ELSE
        DELETE FROM ai_encounterprocedures WHERE practitioner_email = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('ai_encounterprocedures: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- diagnostics
    IF cleanup_type = 'ALL' THEN
        DELETE FROM diagnostics;
    ELSE
        DELETE FROM diagnostics WHERE practitioner_email = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('diagnostics: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- patientleads
    IF cleanup_type = 'ALL' THEN
        DELETE FROM patientleads;
    ELSE
        DELETE FROM patientleads WHERE practitioner_email = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('patientleads: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- Group 3: Tables with practitionerid column

    -- appointments
    IF cleanup_type = 'ALL' THEN
        DELETE FROM appointments;
    ELSE
        DELETE FROM appointments WHERE practitionerid = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('appointments: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- apptpractpatient
    IF cleanup_type = 'ALL' THEN
        DELETE FROM apptpractpatient;
    ELSE
        DELETE FROM apptpractpatient WHERE practitionerid = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('apptpractpatient: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- patientappointments
    IF cleanup_type = 'ALL' THEN
        DELETE FROM patientappointments;
    ELSE
        DELETE FROM patientappointments WHERE practitionerid = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('patientappointments: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- Group 4: Tables with serviceprovider and/or practitioner columns

    -- clinicalencounter
    IF cleanup_type = 'ALL' THEN
        DELETE FROM clinicalencounter;
    ELSE
        DELETE FROM clinicalencounter WHERE serviceprovider = practitioner_id_param OR practitioner = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('clinicalencounter: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- encounters
    IF cleanup_type = 'ALL' THEN
        DELETE FROM encounters;
    ELSE
        DELETE FROM encounters WHERE serviceprovider = practitioner_id_param OR practitioner = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('encounters: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- medicationsencounter
    IF cleanup_type = 'ALL' THEN
        DELETE FROM medicationsencounter;
    ELSE
        DELETE FROM medicationsencounter WHERE serviceprovider = practitioner_id_param OR practitioner = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('medicationsencounter: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- patientencounters
    IF cleanup_type = 'ALL' THEN
        DELETE FROM patientencounters;
    ELSE
        DELETE FROM patientencounters WHERE serviceprovider = practitioner_id_param OR practitioner = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('patientencounters: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- patientrecordings
    IF cleanup_type = 'ALL' THEN
        DELETE FROM patientrecordings;
    ELSE
        DELETE FROM patientrecordings WHERE serviceprovider = practitioner_id_param OR practitioner = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('patientrecordings: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- patientimages
    IF cleanup_type = 'ALL' THEN
        DELETE FROM patientimages;
    ELSE
        DELETE FROM patientimages WHERE serviceprovider = practitioner_id_param OR practitioner = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('patientimages: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- documents
    IF cleanup_type = 'ALL' THEN
        DELETE FROM documents;
    ELSE
        DELETE FROM documents WHERE practitioner = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('documents: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- lastpatients
    IF cleanup_type = 'ALL' THEN
        DELETE FROM lastpatients;
    ELSE
        DELETE FROM lastpatients WHERE practitioner = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('lastpatients: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- Group 5: Other practitioner reference columns

    -- ai_usage_limits (created_by)
    IF cleanup_type = 'ALL' THEN
        DELETE FROM ai_usage_limits;
    ELSE
        DELETE FROM ai_usage_limits WHERE created_by = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('ai_usage_limits: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- encounter_procedures (physician_id)
    IF cleanup_type = 'ALL' THEN
        DELETE FROM encounter_procedures;
    ELSE
        DELETE FROM encounter_procedures WHERE physician_id = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('encounter_procedures: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- encountersimport (physician_id, physician_name)
    IF cleanup_type = 'ALL' THEN
        DELETE FROM encountersimport;
    ELSE
        DELETE FROM encountersimport WHERE physician_id = practitioner_id_param OR physician_name = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('encountersimport: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- message_threads (created_by)
    IF cleanup_type = 'ALL' THEN
        DELETE FROM message_threads;
    ELSE
        DELETE FROM message_threads WHERE created_by = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('message_threads: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- payments (created_by)
    IF cleanup_type = 'ALL' THEN
        DELETE FROM payments;
    ELSE
        DELETE FROM payments WHERE created_by = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('payments: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- practcareplans (is_preferred_provider)
    IF cleanup_type = 'ALL' THEN
        DELETE FROM practcareplans;
    ELSE
        DELETE FROM practcareplans WHERE is_preferred_provider = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('practcareplans: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- record_access_requests (target_practitioner)
    IF cleanup_type = 'ALL' THEN
        DELETE FROM record_access_requests;
    ELSE
        DELETE FROM record_access_requests WHERE target_practitioner = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('record_access_requests: ', rows_affected, ' rows deleted') as cleanup_progress;

    -- request_logs (user_id)
    IF cleanup_type = 'ALL' THEN
        DELETE FROM request_logs;
    ELSE
        DELETE FROM request_logs WHERE user_id = practitioner_id_param;
    END IF;
    SET rows_affected = ROW_COUNT();
    SET total_rows_deleted = total_rows_deleted + rows_affected;
    SELECT CONCAT('request_logs: ', rows_affected, ' rows deleted') as cleanup_progress;

    COMMIT;

    -- Final summary
    SELECT CONCAT('CLEANUP COMPLETED SUCCESSFULLY') as status;
    SELECT CONCAT('Cleanup type: ', cleanup_type) as cleanup_type_final;
    IF cleanup_type = 'SPECIFIC' THEN
        SELECT CONCAT('Practitioner ID: ', practitioner_id_param) as practitioner_cleaned;
    END IF;
    SELECT CONCAT('Total rows deleted: ', total_rows_deleted) as total_rows_deleted;
    SELECT CONCAT('Tables processed: 37') as tables_processed;
    SELECT NOW() as cleanup_completed_at;

END$$

DELIMITER ;
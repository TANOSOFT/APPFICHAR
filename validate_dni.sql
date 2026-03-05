-- =====================================================
-- VALIDACIÓN: Función para validar DNI/NIF español
-- =====================================================

CREATE OR REPLACE FUNCTION validate_spanish_dni(dni_input TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    dni_number INTEGER;
    dni_letter CHAR(1);
    expected_letter CHAR(1);
    letter_table CHAR(23) := 'TRWAGMYFPDXBNJZSQVHLCKE';
BEGIN
    -- Eliminar espacios y convertir a mayúsculas
    dni_input := UPPER(TRIM(dni_input));
    
    -- Verificar longitud (8 dígitos + 1 letra)
    IF LENGTH(dni_input) != 9 THEN
        RETURN FALSE;
    END IF;
    
    -- Extraer número y letra
    dni_number := SUBSTRING(dni_input FROM 1 FOR 8)::INTEGER;
    dni_letter := SUBSTRING(dni_input FROM 9 FOR 1);
    
    -- Calcular letra esperada
    expected_letter := SUBSTRING(letter_table FROM ((dni_number % 23) + 1) FOR 1);
    
    -- Comparar
    RETURN dni_letter = expected_letter;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Pruebas de validación
-- SELECT validate_spanish_dni('12345678Z'); -- Ejemplo (ajusta con DNI válido real)

COMMENT ON FUNCTION validate_spanish_dni IS 'Valida formato de DNI/NIF español según algoritmo oficial';

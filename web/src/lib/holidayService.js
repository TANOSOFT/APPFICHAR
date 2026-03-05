/**
 * Service to fetch public holidays for Spain from Nager.Date API
 */

// Mapping of Spanish provinces to ISO 3166-2 regional codes for Nager.Date API
const PROVINCE_TO_REGION = {
    'alava': 'ES-PV', 'araba': 'ES-PV',
    'albacete': 'ES-CM',
    'alicante': 'ES-VC', 'alacant': 'ES-VC',
    'almeria': 'ES-AN',
    'asturias': 'ES-AS',
    'avila': 'ES-CL',
    'badajoz': 'ES-EX',
    'baleares': 'ES-IB', 'illes balears': 'ES-IB',
    'barcelona': 'ES-CT',
    'burgos': 'ES-CL',
    'caceres': 'ES-EX',
    'cadiz': 'ES-AN',
    'cantabria': 'ES-CB',
    'castellon': 'ES-VC', 'castello': 'ES-VC',
    'ciudad real': 'ES-CM',
    'cordoba': 'ES-AN',
    'coruña': 'ES-GA', 'a coruña': 'ES-GA',
    'cuenca': 'ES-CM',
    'girona': 'ES-CT',
    'granada': 'ES-AN',
    'guadalajara': 'ES-CM',
    'guipuzcoa': 'ES-PV', 'gipuzkoa': 'ES-PV',
    'huelva': 'ES-AN',
    'huesca': 'ES-AR',
    'jaen': 'ES-AN',
    'leon': 'ES-CL',
    'lleida': 'ES-CT',
    'lugo': 'ES-GA',
    'madrid': 'ES-MD',
    'malaga': 'ES-AN',
    'murcia': 'ES-MC',
    'navarra': 'ES-NC', 'nafarroa': 'ES-NC',
    'ourense': 'ES-GA',
    'palencia': 'ES-CL',
    'las palmas': 'ES-CN',
    'pontevedra': 'ES-GA',
    'la rioja': 'ES-RI',
    'salamanca': 'ES-CL',
    'santa cruz de tenerife': 'ES-CN',
    'segovia': 'ES-CL',
    'sevilla': 'ES-AN',
    'soria': 'ES-CL',
    'tarragona': 'ES-CT',
    'teruel': 'ES-AR',
    'toledo': 'ES-CM',
    'valencia': 'ES-VC',
    'valladolid': 'ES-CL',
    'vizcaya': 'ES-PV', 'bizkaia': 'ES-PV',
    'zamora': 'ES-CL',
    'zaragoza': 'ES-AR',
    'ceuta': 'ES-CE',
    'melilla': 'ES-ML'
};

export const fetchSpanishHolidays = async (year, provinceName) => {
    try {
        const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/ES`);
        if (!response.ok) throw new Error('Error al conectar con el servicio de festivos');

        const allHolidays = await response.json();
        const regionCode = PROVINCE_TO_REGION[provinceName?.toLowerCase().trim()];

        // Filter holidays:
        // 1. National (counties is null)
        // 2. Regional (counties includes our regionCode)
        return allHolidays.filter(holiday => {
            if (!holiday.counties) return true; // National
            if (regionCode && holiday.counties.includes(regionCode)) return true; // Regional
            return false;
        }).map(h => ({
            date: h.date,
            name: h.localName || h.name
        }));
    } catch (error) {
        console.error('Holiday API Error:', error);
        throw error;
    }
};

export const getProvincesList = () => {
    return Object.keys(PROVINCE_TO_REGION).sort();
};

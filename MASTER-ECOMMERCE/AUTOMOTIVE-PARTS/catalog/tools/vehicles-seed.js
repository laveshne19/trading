'use strict';
/**
 * Vehicle database seed (make > model > generation > years > variants).
 * RULE: only well-known public generation codes / production years. Where unsure the
 * generation list is left EMPTY (model still selectable; fitment then uses model-name matching only).
 * Gen tuple: [code, yearFrom, yearTo|null, [chassis/match codes], [variants]]
 * Add rows freely; `node catalog/tools/build_view.js` regenerates vehicles.json and re-links products.
 */
const LCI = (a, b) => [`Pre-facelift`, `Facelift (LCI)`];
const G = (code, from, to, codes, variants = []) => ({ code, from, to, codes: codes || [code], variants });
const M = (name, gens = [], tokens = null) => ({ name, gens, tokens });

module.exports = [
  { make: 'Mercedes-Benz', country: 'Germany', models: [
    M('A-Class', [G('W176', 2012, 2018, ['W176', 'A176']), G('W177', 2018, null, ['W177', 'V177'])], ['A-CLASS', 'ACLASS']),
    M('C-Class', [G('W204', 2007, 2014, ['W204', 'S204', 'C204']), G('W205', 2014, 2021, ['W205', 'S205', 'C205', 'A205']), G('W206', 2021, null, ['W206', 'S206'])], ['C-CLASS', 'CCLASS']),
    M('E-Class', [G('W212', 2009, 2016, ['W212', 'S212', 'C207', 'A207']), G('W213', 2016, 2023, ['W213', 'S213', 'C238', 'A238', 'W238']), G('W214', 2023, null, ['W214', 'S214'])], ['E-CLASS', 'ECLASS']),
    M('S-Class', [G('W221', 2005, 2013, ['W221', 'C216']), G('W222', 2013, 2020, ['W222', 'V222', 'X222', 'C217']), G('W223', 2020, null, ['W223', 'Z223'])], ['S-CLASS', 'SCLASS']),
    M('CLA', [G('C117', 2013, 2019, ['C117', 'CLA117', 'X117']), G('C118', 2019, null, ['C118', 'X118'])]),
    M('CLS', [G('C218', 2011, 2018, ['C218', 'X218']), G('C257', 2018, null, ['C257'])]),
    M('GLA', [G('X156', 2013, 2020, ['X156']), G('H247', 2019, null, ['H247'])]),
    M('GLB', [G('X247', 2019, null, ['X247'])]),
    M('GLC', [G('X253', 2015, 2022, ['X253', 'C253', 'GLC253']), G('X254', 2022, null, ['X254', 'C254'])]),
    M('GLE', [G('W166', 2011, 2019, ['W166', 'C292', 'W292']), G('W167', 2019, null, ['W167', 'GLE167', 'V167', 'C167'])]),
    M('GLS', [G('X166', 2012, 2019, ['X166']), G('X167', 2019, null, ['X167', 'GLS167'])]),
    M('G-Class', [G('W463', 1990, 2018, ['W463']), G('W463A', 2018, null, ['W463A'])], ['G-CLASS', 'GCLASS']),
    M('V-Class / Vito', [G('W447', 2014, null, ['W447'])], ['VCLASS', 'V-CLASS', 'VITO']),
  ] },
  { make: 'BMW', country: 'Germany', models: [
    M('1 Series', [G('E87', 2004, 2013, ['E81', 'E82', 'E87', 'E88']), G('F20', 2011, 2019, ['F20', 'F21']), G('F40', 2019, null, ['F40']), G('F52', 2017, null, ['F52'])], ['1SERIES']),
    M('2 Series', [G('F22', 2013, 2021, ['F22', 'F23', 'F44', 'F45', 'F46']), G('G42', 2021, null, ['G42', 'G87'])], ['2SERIES']),
    M('3 Series', [G('E46', 1998, 2006, ['E46']), G('E90', 2005, 2013, ['E90', 'E91', 'E92', 'E93']), G('F30', 2012, 2019, ['F30', 'F31', 'F34', 'F35', 'F80'], ['Pre-LCI', 'LCI (facelift)']), G('G20', 2018, null, ['G20', 'G21', 'G28', 'G80', 'G81'], ['Pre-LCI', 'LCI (facelift)'])], ['3SERIES']),
    M('4 Series', [G('F32', 2013, 2020, ['F32', 'F33', 'F36', 'F82', 'F83']), G('G22', 2020, null, ['G22', 'G23', 'G26', 'G82', 'G83'])], ['4SERIES']),
    M('5 Series', [G('E39', 1995, 2003, ['E39']), G('E60', 2003, 2010, ['E60', 'E61']), G('F10', 2009, 2017, ['F10', 'F11', 'F18'], ['Pre-LCI', 'LCI (facelift)']), G('G30', 2016, 2023, ['G30', 'G31', 'G38'], ['Pre-LCI', 'LCI (facelift)']), G('G60', 2023, null, ['G60', 'G61', 'G68'])], ['5SERIES']),
    M('6 Series', [G('F12', 2011, 2018, ['F06', 'F12', 'F13']), G('G32', 2017, 2023, ['G32'])], ['6SERIES']),
    M('7 Series', [G('F01', 2008, 2015, ['F01', 'F02', 'F03', 'F04']), G('G11', 2015, 2022, ['G11', 'G12'], ['Pre-LCI', 'LCI (facelift)']), G('G70', 2022, null, ['G70'])], ['7SERIES']),
    M('8 Series', [G('G15', 2018, null, ['G14', 'G15', 'G16'])], ['8SERIES']),
    M('X1', [G('E84', 2009, 2015, ['E84']), G('F48', 2015, 2022, ['F48', 'F49']), G('U11', 2022, null, ['U11', 'U12'])]),
    M('X2', [G('F39', 2018, 2023, ['F39'])]),
    M('X3', [G('F25', 2010, 2017, ['F25']), G('G01', 2017, 2024, ['G01'], ['Pre-LCI', 'LCI (facelift)'])]),
    M('X4', [G('F26', 2014, 2018, ['F26']), G('G02', 2018, null, ['G02'])]),
    M('X5', [G('E53', 1999, 2006, ['E53']), G('E70', 2006, 2013, ['E70']), G('F15', 2013, 2018, ['F15', 'F85']), G('G05', 2018, null, ['G05'], ['Pre-LCI', 'LCI (facelift)'])]),
    M('X6', [G('E71', 2008, 2014, ['E71', 'E72']), G('F16', 2014, 2019, ['F16', 'F86']), G('G06', 2019, null, ['G06'])]),
    M('X7', [G('G07', 2018, null, ['G07'])]),
    M('Z4', [G('G29', 2018, null, ['G29'])]),
    M('iX', [G('I20', 2021, null, ['I20'])]),
  ] },
  { make: 'Audi', country: 'Germany', models: [
    M('A1', [G('8X', 2010, 2018, ['8X']), G('GB', 2018, null, ['GB'])], ['A1', 'S1']),
    M('A3', [G('8P', 2003, 2013, ['8P']), G('8V', 2012, 2020, ['8V']), G('8Y', 2020, null, ['8Y'])], ['A3', 'S3', 'RS3']),
    M('A4', [G('B8', 2007, 2016, ['B8']), G('B9', 2015, null, ['B9'])], ['A4', 'S4', 'RS4']),
    M('A5', [G('8T', 2007, 2016, ['8T']), G('F5', 2016, null, ['F5'])], ['A5', 'S5', 'RS5']),
    M('A6', [G('C7', 2011, 2018, ['C7']), G('C8', 2018, null, ['C8'])], ['A6', 'S6', 'RS6']),
    M('A7', [G('4G', 2010, 2018, ['4G']), G('4K', 2018, null, ['4K'])], ['A7', 'S7', 'RS7']),
    M('A8', [G('D4', 2010, 2017, ['D4']), G('D5', 2017, null, ['D5'])], ['A8', 'S8']),
    M('Q2', [G('GA', 2016, null, ['GA'])]),
    M('Q3', [G('8U', 2011, 2018, ['8U']), G('F3', 2018, null, ['F3'])], ['Q3', 'RSQ3']),
    M('Q5', [G('8R', 2008, 2017, ['8R']), G('FY', 2017, null, ['FY'])], ['Q5', 'SQ5']),
    M('Q7', [G('4L', 2005, 2015, ['4L']), G('4M', 2015, null, ['4M'])], ['Q7', 'SQ7']),
    M('Q8', [G('4M-Q8', 2018, null, ['Q8'])], ['Q8', 'SQ8']),
  ] },
  { make: 'Volkswagen', country: 'Germany', models: [
    M('Polo', [G('AW', 2017, null, ['AW'])]), M('Golf', [G('MK7', 2012, 2019, ['MK7', 'MK7.5']), G('MK8', 2019, null, ['MK8'])]),
    M('Passat', [G('B8', 2014, null, ['B8'])]), M('Tiguan', [G('AD1', 2016, null, ['AD1'])]),
    M('Touareg', [G('7P', 2010, 2018, ['7P']), G('CR7', 2018, null, ['CR7'])]), M('Jetta'), M('Arteon', [G('3H', 2017, null, ['3H'])]), M('T-Cross', [G('C11', 2019, null, ['C11'])], ['T-CROSS', 'TCROSS']),
  ] },
  { make: 'SEAT', country: 'Spain', models: [M('Leon', [G('5F', 2012, 2020, ['5F', 'MK3'])]), M('Ibiza'), M('Ateca'), M('Tarraco')] },
  { make: 'Skoda', country: 'Czechia', models: [
    M('Octavia', [G('5E', 2013, 2020, ['5E']), G('NX', 2019, null, ['NX'])]), M('Superb', [G('3V', 2015, null, ['3V'])]), M('Kodiaq', [G('NS', 2016, null, ['NS'])]),
    M('Kushaq'), M('Slavia'), M('Rapid'), M('Yeti'), M('Karoq'), M('Fabia'),
  ] },
  { make: 'Porsche', country: 'Germany', models: [
    M('Cayenne', [G('9PA', 2002, 2010, ['9PA']), G('92A', 2010, 2017, ['92A']), G('9YA', 2017, null, ['9YA'])]),
    M('Macan', [G('95B', 2014, null, ['95B'])]), M('Panamera', [G('970', 2009, 2016, ['970']), G('971', 2016, null, ['971'])]),
    M('911', [G('991', 2011, 2019, ['991']), G('992', 2018, null, ['992'])]), M('Taycan', [G('J1', 2019, null, ['J1'])]),
    M('Cayman / Boxster', [G('981', 2012, 2016, ['981']), G('718', 2016, null, ['718'])], ['CAYMAN', 'BOXSTER']),
  ] },
  { make: 'Land Rover', country: 'United Kingdom', models: [
    M('Range Rover Vogue', [G('L322', 2002, 2012, ['L322']), G('L405', 2012, 2021, ['L405']), G('L460', 2021, null, ['L460'])], ['RANGEROVER', 'VOGUE']),
    M('Range Rover Sport', [G('L320', 2005, 2013, ['L320']), G('L494', 2013, 2022, ['L494']), G('L461', 2022, null, ['L461'])]),
    M('Range Rover Evoque', [G('L538', 2011, 2019, ['L538']), G('L551', 2019, null, ['L551'])], ['EVOQUE']),
    M('Range Rover Velar', [G('L560', 2017, null, ['L560'])], ['VELAR']),
    M('Discovery Sport', [G('L550', 2014, null, ['L550'])]), M('Discovery', []), M('Defender', [G('L663', 2019, null, ['L663'])]),
  ] },
  { make: 'Jaguar', country: 'United Kingdom', models: [
    M('XF', [G('X250', 2007, 2015, ['X250']), G('X260', 2015, null, ['X260'])]), M('XE', [G('X760', 2015, null, ['X760'])]),
    M('XJ', [G('X351', 2009, 2019, ['X351'])]), M('F-Pace', [G('X761', 2015, null, ['X761'])], ['F-PACE', 'FPACE']), M('F-Type', [G('X152', 2013, null, ['X152'])], ['F-TYPE', 'FTYPE']),
  ] },
  { make: 'Bentley', country: 'United Kingdom', models: [M('Continental GT'), M('Bentayga'), M('Flying Spur')] },
  { make: 'Rolls-Royce', country: 'United Kingdom', models: [
    M('Ghost', [G('RR4', 2009, 2020, ['RR4']), G('RR21', 2020, null, ['RR21'])]), M('Phantom', [G('VII', 2003, 2017, ['PHANTOM-VII']), G('VIII', 2017, null, ['PHANTOM-VIII'])]),
    M('Cullinan', [G('RR31', 2018, null, ['RR31'])]), M('Wraith', [G('RR5', 2013, 2023, ['RR5'])]),
  ] },
  { make: 'Lamborghini', country: 'Italy', models: [M('Urus', [G('Urus', 2018, null, ['URUS'])]), M('Huracan'), M('Aventador')] },
  { make: 'Ferrari', country: 'Italy', models: [M('488'), M('F8'), M('Roma'), M('Portofino'), M('812')] },
  { make: 'Maserati', country: 'Italy', models: [
    M('Ghibli', [G('M157', 2013, 2023, ['M157'])]), M('Quattroporte', [G('M139', 2003, 2012, ['M139']), G('M156', 2013, null, ['M156'])]), M('Levante', [G('M161', 2016, null, ['M161'])]),
  ] },
  { make: 'Aston Martin', country: 'United Kingdom', models: [M('DB11'), M('Vantage'), M('DBX'), M('DBS')] },
  { make: 'Volvo', country: 'Sweden', models: [
    M('XC90', [G('Gen 1', 2002, 2014, ['XC90-1']), G('Gen 2', 2014, null, ['XC90-2'])], ['XC90']), M('XC60', [G('Gen 1', 2008, 2017, ['XC60-1']), G('Gen 2', 2017, null, ['XC60-2'])], ['XC60']),
    M('S90', [G('Gen 1', 2016, null, ['S90'])]), M('XC40', [G('Gen 1', 2017, null, ['XC40'])]), M('S60'), M('XC70'),
  ] },
  { make: 'Lexus', country: 'Japan', models: [
    M('ES', [G('XV70', 2018, null, ['XV70'])]), M('LS', [G('XF50', 2017, null, ['XF50'])]), M('NX', [G('AZ10', 2014, 2021, ['AZ10']), G('AZ20', 2021, null, ['AZ20'])]),
    M('RX', [G('AL20', 2015, 2022, ['AL20']), G('AL30', 2022, null, ['AL30'])]), M('LX', [G('J200', 2007, 2021, ['J200']), G('J300', 2021, null, ['J300'])]),
  ] },
  { make: 'Mini', country: 'United Kingdom', models: [M('Cooper', [G('R56', 2006, 2013, ['R56']), G('F56', 2013, null, ['F56'])]), M('Countryman', [G('F60', 2016, null, ['F60'])])] },
  { make: 'Jeep', country: 'USA', models: [
    M('Compass', [G('MK', 2006, 2016, ['MK49']), G('MP', 2017, null, ['MP'])]), M('Wrangler', [G('JK', 2006, 2018, ['JK']), G('JL', 2017, null, ['JL'])]),
    M('Grand Cherokee', [G('WK2', 2010, 2021, ['WK2']), G('WL', 2021, null, ['WL'])]), M('Meridian'), M('Renegade'), M('Cherokee'),
  ] },
  { make: 'Toyota', country: 'Japan', models: [
    M('Fortuner', [G('AN50/AN60', 2005, 2015, ['AN50', 'AN60']), G('AN150/AN160', 2015, null, ['AN150', 'AN160'])]),
    M('Land Cruiser', [G('J200', 2007, 2021, ['J200']), G('J300', 2021, null, ['J300'])]),
    M('Innova', [G('AN40', 2004, 2015, ['AN40']), G('AN140 (Crysta)', 2015, null, ['AN140'])]), M('Camry'), M('Hilux'), M('Corolla'),
  ] },
  { make: 'Hyundai', country: 'South Korea', models: [M('Creta'), M('Verna'), M('i20'), M('Venue'), M('Alcazar'), M('Tucson'), M('Santa Fe'), M('Elantra'), M('Sonata')] },
  { make: 'Kia', country: 'South Korea', models: [M('Seltos'), M('Sonet'), M('Carens'), M('Carnival'), M('Sportage'), M('Sorento')] },
  { make: 'Honda', country: 'Japan', models: [M('City'), M('Civic'), M('Amaze'), M('Elevate'), M('CR-V'), M('Accord'), M('CR-Z')] },
  { make: 'Maruti Suzuki', country: 'India', models: [M('Swift'), M('Baleno'), M('Brezza'), M('Ertiga'), M('Grand Vitara'), M('Dzire'), M('Fronx'), M('Jimny')] },
  { make: 'Tata', country: 'India', models: [M('Nexon'), M('Harrier'), M('Safari'), M('Punch'), M('Altroz'), M('Tiago')] },
  { make: 'Mahindra', country: 'India', models: [M('XUV700'), M('Scorpio'), M('Thar'), M('XUV300'), M('Bolero')] },
  { make: 'MG', country: 'United Kingdom / China', models: [M('Hector'), M('Astor'), M('ZS EV'), M('Gloster'), M('Comet')] },
  { make: 'Renault', country: 'France', models: [M('Duster'), M('Kiger'), M('Triber'), M('Kwid'), M('Megane'), M('Kadjar')] },
  { make: 'Nissan', country: 'Japan', models: [M('Magnite'), M('Kicks'), M('X-Trail'), M('Qashqai'), M('Juke')] },
  { make: 'Isuzu', country: 'Japan', models: [M('D-Max V-Cross'), M('MU-X')] },
  { make: 'Tesla', country: 'USA', models: [M('Model 3'), M('Model S'), M('Model X'), M('Model Y')] },
  { make: 'Infiniti', country: 'Japan', models: [M('Q50'), M('QX50'), M('QX60')] },
  { make: 'Opel / Vauxhall', country: 'Germany', models: [M('Astra'), M('Insignia'), M('Corsa'), M('Zafira')] },
];

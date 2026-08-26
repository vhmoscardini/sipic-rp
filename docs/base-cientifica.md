# Base científica e fontes

## Vênus como referência extrema

A NASA descreve Vênus com temperatura superficial próxima de 464–467 °C, pressão de superfície próxima de 92 bar e atmosfera dominada por dióxido de carbono. Esses valores dão suporte ao módulo didático de transferência radiativa, sem estabelecer equivalência física com o ambiente urbano terrestre.

- [NASA Science — Venus Facts](https://science.nasa.gov/venus/venus-facts/)
- [NASA — Instrument to Measure Temperature, Pressure, and Wind on Venus](https://www.nasa.gov/solar-system/nasa-instrument-to-measure-temperature-pressure-and-wind-on-venus/)

## Meteorologia e previsão

O sistema usa a Open-Meteo Forecast API para condições atuais e previsão horária. A fonte é tratada como dado **modelado**. A API permite solicitar temperatura, umidade, temperatura aparente, pressão, vento, radiação, precipitação, temperatura do solo e códigos meteorológicos WMO.

- [Open-Meteo — Weather Forecast API](https://open-meteo.com/en/docs)
- [Open-Meteo — Terms and attribution](https://open-meteo.com/en/terms)

## Qualidade do ar

A Open-Meteo Air Quality API fornece variáveis do CAMS, incluindo material particulado, gases, AQI e índice UV. Por ser produto modelado, precisa ser validado contra monitoramento local quando a pesquisa exigir exposição em escala de bairro.

- [Open-Meteo — Air Quality API](https://open-meteo.com/en/docs/air-quality-api)
- [Copernicus Atmosphere Monitoring Service](https://atmosphere.copernicus.eu/)

## Radiação e série diária

A NASA POWER API é usada para obter série diária de radiação solar e variáveis meteorológicas de apoio. No sistema, ela funciona como fonte complementar e verificação de coerência temporal.

- [NASA POWER — Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/)

## Sensoriamento remoto de ilhas de calor

Produtos térmicos e de cobertura do solo obtidos por satélite podem apoiar a análise de temperatura de superfície, NDVI, albedo, emissividade e impermeabilização. A NASA ARSET apresenta aplicações de sensoriamento remoto para ilhas de calor urbanas.

- [NASA Earthdata ARSET — Satellite Remote Sensing for Urban Heat Islands](https://www.earthdata.nasa.gov/learn/trainings/satellite-remote-sensing-urban-heat-islands)

## Dados meteorológicos oficiais do Brasil

O INMET disponibiliza estações, séries históricas, BDMEP e normais climatológicas. O projeto registra o INMET como referência para validação e futura integração ETL. O painel não afirma que os dados atuais vieram diretamente de uma estação do INMET.

- [INMET — Portal](https://portal.inmet.gov.br/)
- [INMET — Dados históricos](https://portal.inmet.gov.br/dadoshistoricos)
- [INMET — BDMEP](https://bdmep.inmet.gov.br/)
- [INMET — Tabela/mapa de estações](https://tempo.inmet.gov.br/)

## Contexto de Ribeirão Preto

Há trabalhos acadêmicos com SIG, imagens Landsat, NDVI, arborização e temperatura no quadrilátero central de Ribeirão Preto. Eles ajudam a formular hipóteses locais, mas não substituem a construção de uma base atualizada e reproduzível para o projeto.

- [UNESP — Análise da arborização do quadrilátero central de Ribeirão Preto](https://repositorio.unesp.br/handle/11449/114001)

## Variáveis recomendadas para a evolução do estudo

### Atmosfera

- temperatura do ar;
- umidade relativa;
- temperatura aparente;
- velocidade e direção do vento;
- radiação solar;
- precipitação;
- pressão;
- material particulado e gases, quando disponíveis.

### Superfície e morfologia

- temperatura de superfície terrestre;
- NDVI e cobertura arbórea;
- NDBI e impermeabilização;
- albedo e emissividade;
- altura e densidade de edificações;
- fator de visão do céu;
- orientação e largura das vias;
- calor antropogênico.

### Validação

- MAE, RMSE, viés e R²;
- cobertura dos intervalos de incerteza;
- validação temporal independente;
- validação espacial em estações não usadas no ajuste;
- auditoria de falhas, lacunas e imputações;
- rastreabilidade de cada valor como observado, modelado, calculado, predito ou simulado.

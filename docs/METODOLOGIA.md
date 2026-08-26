# Metodologia do modelo experimental

## Objetivo

Estimar diferenças térmicas intraurbanas de Ribeirão Preto e produzir uma previsão acadêmica de curto prazo, mantendo separadas as variáveis obtidas de serviços meteorológicos, as correções morfológicas e os cenários simulados.

## Pipeline atual

1. **Forçante meteorológica:** temperatura, umidade, vento, pressão, radiação, precipitação e temperatura aparente da Open-Meteo.
2. **Qualidade do ar:** CAMS por meio da Open-Meteo Air Quality API.
3. **Referência solar:** NASA POWER para séries diárias e verificação de coerência.
4. **Morfologia experimental:** impermeabilização, NDVI, fator de visão do céu, densidade construída e ventilação por setor.
5. **Correção espacial:** a previsão municipal recebe um deslocamento dependente da morfologia, do vento e do ciclo diurno.
6. **Temperatura de superfície:** estimada a partir da temperatura do ar, radiação/ciclo solar, impermeabilização, vegetação e temperatura superficial do solo disponível no modelo meteorológico.
7. **Ilha de calor:** diferença entre cada setor e a referência periurbana experimental.
8. **Risco:** combinação exploratória da temperatura aparente, ilha de calor, impermeabilização e NDVI.
9. **Incerteza:** intervalo crescente com o horizonte e com a magnitude da correção espacial.

## Formulação simplificada

A correção térmica de cada setor é representada por:

```text
ΔTsetor = deslocamento_morfológico × ciclo_diurno
          − vento × ventilação × coeficiente
```

A temperatura do ar setorial é:

```text
Tar,setor = Tar,meteorologia + ΔTsetor
```

A intensidade experimental da ilha de calor é:

```text
ICUsetor = max(0, Tar,setor − Tar,referência)
```

A temperatura de superfície é uma aproximação e não deve ser apresentada como leitura orbital instantânea:

```text
Tsuperfície ≈ Tar,setor
              + termo_base
              + ciclo_solar × (radiação absorvida pela morfologia)
              + contribuição térmica do solo
```

## Papel de Vênus

Vênus é usado como caso extremo para organizar a discussão sobre:

- balanço radiativo;
- absorção e emissão;
- aprisionamento de energia;
- circulação e redistribuição térmica;
- sensibilidade de parâmetros.

Não existe transferência direta de coeficientes venusianos para a cidade. A comparação do dashboard é uma analogia controlada e uma ferramenta didática.

## Validação necessária para a pesquisa final

- instalar ou obter estações locais em setores com morfologias contrastantes;
- calibrar sensores contra instrumento de referência;
- comparar dados do modelo com INMET e outras fontes oficiais;
- substituir coordenadas representativas por polígonos GIS auditáveis;
- estimar NDVI, NDBI, albedo, emissividade e LST por cena orbital;
- separar treino, validação temporal e validação espacial;
- calcular MAE, RMSE, viés, R² e cobertura dos intervalos;
- testar o modelo em episódios de calor e em períodos sem evento;
- documentar dados ausentes, imputação e controle de qualidade;
- avaliar exposição populacional somente após aprovação metodológica adequada.

## Interpretação correta no trabalho

| Elemento | Interpretação |
|---|---|
| Meteorologia da Open-Meteo | Saída de modelo/serviço externo, não sensor local |
| Qualidade do ar CAMS | Modelo atmosférico regional/global |
| Setores | Grade experimental representativa |
| Temperatura de superfície | Estimativa calculada |
| Previsão por setor | Predição experimental |
| Cenário de arborização | Simulação hipotética |
| Vênus | Referência teórica e didática |

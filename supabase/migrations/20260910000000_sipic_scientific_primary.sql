-- SIPIC-RP — ESQUEMA CIENTÍFICO PRINCIPAL
-- Migration gerada a partir do banco fornecido pelo projeto.

create extension if not exists pgcrypto;

-- ====================================================================================
-- SISTEMA INTELIGENTE DE MONITORAMENTO E PREDIÇÃO DE ILHAS DE CALOR URBANAS (SIPIC-RP)
-- Esquema Completo e Consolidado do Banco de Dados PostgreSQL (Supabase)
-- Baseado no Artigo Científico (UNIFRAN) e na Fundamentação Teórica dos Índices Térmicos
-- ====================================================================================

-- 1. CADASTRO DE SETORES E ÁREAS DE REFERÊNCIA
-- Mapeia as regiões urbanas e de referência (ex: Ribeirão Preto) com características LULC e morfológicas.
CREATE TABLE setores_urbanos (
    id_setor UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_setor VARCHAR(30) UNIQUE NOT NULL,
    nome_regiao VARCHAR(100) NOT NULL, -- Ex: 'Centro', 'Zona Norte', 'Zona Sul'
    tipo_area VARCHAR(20) NOT NULL CHECK (tipo_area IN ('Urbana', 'Referencia', 'Rural')),
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    altitude_z DECIMAL(8,2), -- Topografia (z)
    uso_solo_lulc VARCHAR(50), -- Uso e cobertura do solo (LULC)
    cobertura_vegetal VARCHAR(100), -- Proporção ou tipo de vegetação
    area_construida_pct DECIMAL(5,2), -- Percentual de área construída
    densidade_edificacoes DECIMAL(8,2), -- Densidade de edificações
    altura_media_edificios DECIMAL(6,2) -- Morfologia urbana (altura média)
);

-- 2. FONTES DE DADOS (APIs E ESTAÇÕES)
-- Rastreia as origens dos dados descritas na metodologia (Open-Meteo, OpenWeather, Meteomatics, CAMS, INMET, NASA POWER).
CREATE TABLE fontes_dados (
    id_fonte SERIAL PRIMARY KEY,
    nome_fonte VARCHAR(50) NOT NULL, 
    tipo_dado VARCHAR(50) NOT NULL
);

-- 3. SÉRIES TEMPORAIS DE COLETA (VARIÁVEIS PRIMÁRIAS)
-- Armazena os dados brutos e padronizados coletados pelas 4 APIs e estações.
CREATE TABLE medicoes_ambientais (
    id_medicao BIGSERIAL PRIMARY KEY,
    id_setor UUID REFERENCES setores_urbanos(id_setor) ON DELETE CASCADE,
    id_fonte INTEGER REFERENCES fontes_dados(id_fonte),
    data_hora TIMESTAMP NOT NULL, -- (t) Data e hora da medição
    
    -- Temperatura
    temperatura_ar_t DECIMAL(6,2), -- T (Temperatura do ar)
    temperatura_urbana_tu DECIMAL(6,2), -- Tᵤ (Temperatura urbana)
    temperatura_referencia_tr DECIMAL(6,2), -- Tᵣ (Temperatura de referência)
    
    -- Vento
    velocidade_vento_v DECIMAL(5,2), -- V (Velocidade)
    direcao_vento_theta DECIMAL(5,2), -- θ (Direção)
    componente_zonal_u DECIMAL(6,2), -- u (Componente zonal)
    componente_meridional_v_comp DECIMAL(6,2), -- v (Componente meridional)
    
    -- Umidade e Precipitação
    umidade_relativa_rh DECIMAL(5,2), -- RH (Umidade relativa)
    precipitacao_p DECIMAL(8,2), -- P (Precipitação)
    
    -- Radiação (Onda Curta e Onda Longa)
    rad_onda_curta_desc_sw_down DECIMAL(8,2), -- SW↓ (Onda curta descendente)
    rad_onda_curta_asc_sw_up DECIMAL(8,2), -- SW↑ (Onda curta ascendente)
    rad_onda_longa_desc_lw_down DECIMAL(8,2), -- LW↓ (Onda longa descendente)
    rad_onda_longa_asc_lw_up DECIMAL(8,2), -- LW↑ (Onda longa ascendente)
    
    -- Atmosfera
    nebulosidade_c DECIMAL(5,2), -- C (Nebulosidade)
    pressao_atm_p_atm DECIMAL(8,2), -- P_atm (Pressão atmosférica)
    CONSTRAINT uq_medicao_setor_tempo_fonte UNIQUE (id_setor, data_hora, id_fonte)
);

-- 4. CÁLCULO DOS ÍNDICES TÉRMICOS ESPECIALIZADOS

-- 4.1. IFT - Índice de Forçamento Térmico
-- Fórmula: IFT = SW↓ − SW↑ + LW↓ − LW↑
CREATE TABLE indice_forcamento_termico (
    id_ift BIGSERIAL PRIMARY KEY,
    id_medicao BIGINT REFERENCES medicoes_ambientais(id_medicao) ON DELETE CASCADE,
    sw_down DECIMAL(8,2),
    sw_up DECIMAL(8,2),
    lw_down DECIMAL(8,2),
    lw_up DECIMAL(8,2),
    valor_ift DECIMAL(10,2) NOT NULL -- Quantidade de energia radiativa disponível no sistema
);

-- 4.2. IIA - Índice de Influência Adveccional
-- Fórmula: A_T = −(u * ∂T/∂x + v * ∂T/∂y), IIA = |A_T|
CREATE TABLE indice_influencia_adveccional (
    id_iia BIGSERIAL PRIMARY KEY,
    id_setor UUID REFERENCES setores_urbanos(id_setor),
    data_hora TIMESTAMP NOT NULL,
    gradiente_temperatura_x DECIMAL(8,4), -- ∂T/∂x
    gradiente_temperatura_y DECIMAL(8,4), -- ∂T/∂y
    componente_u DECIMAL(6,2), -- u
    componente_v DECIMAL(6,2), -- v
    valor_at DECIMAL(10,4), -- A_T
    valor_iia DECIMAL(10,4) NOT NULL -- Magnitude do transporte horizontal de calor
);

-- 4.3. IITR - Índice de Intensidade Térmica Relativa
-- Fórmula: IITR = Tᵤ − Tᵤ,ᵣₑ𝒻
CREATE TABLE indice_intensidade_termica_relativa (
    id_iitr BIGSERIAL PRIMARY KEY,
    id_medicao BIGINT REFERENCES medicoes_ambientais(id_medicao) ON DELETE CASCADE,
    temperatura_urbana DECIMAL(6,2),
    temperatura_referencia DECIMAL(6,2),
    valor_iitr DECIMAL(5,2) NOT NULL -- Medida de anomalia térmica
);

-- 4.4. IICU - Intensidade da Ilha de Calor Urbana (Variável Alvo Principal da IA)
-- Fórmula: IICU = Tᵤ − Tᵣ
CREATE TABLE intensidade_ilha_calor_urbana (
    id_iicu BIGSERIAL PRIMARY KEY,
    id_medicao BIGINT REFERENCES medicoes_ambientais(id_medicao) ON DELETE CASCADE,
    temperatura_urbana_tu DECIMAL(6,2),
    temperatura_referencia_tr DECIMAL(6,2),
    valor_iicu DECIMAL(5,2) NOT NULL -- Indicador direto da intensidade da ICU
);

-- 4.5. IPT - Índice de Persistência Térmica
-- Fórmula: IPT = ∑ₜ₌₁ⁿ I(ΔTₜ > τ) Δt
CREATE TABLE indice_persistencia_termica (
    id_ipt BIGSERIAL PRIMARY KEY,
    id_setor UUID REFERENCES setores_urbanos(id_setor),
    data_inicio TIMESTAMP,
    data_fim TIMESTAMP,
    limiar_tau DECIMAL(5,2), -- τ (Limiar definido)
    tempo_acumulado_horas DECIMAL(8,2) NOT NULL -- Duração acumulada do episódio de aquecimento acima do limiar
);

-- 5. INTELIGÊNCIA ARTIFICIAL E SISTEMA DE ALERTAS
-- Armazena os resultados preditivos gerados pelos algoritmos de aprendizado de máquina.
CREATE TABLE predicoes_modelo_ia (
    id_predicao BIGSERIAL PRIMARY KEY,
    id_setor UUID REFERENCES setores_urbanos(id_setor),
    data_hora_alvo TIMESTAMP NOT NULL,
    iicu_predito DECIMAL(5,2) NOT NULL,
    confianca_pct DECIMAL(5,2),
    versao_modelo VARCHAR(50),
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_predicao_setor_alvo_modelo UNIQUE (id_setor, data_hora_alvo, versao_modelo)
);

-- Sistema de Alertas estruturado conforme os níveis de risco da Tabela 2.
CREATE TABLE sistema_alertas (
    id_alerta BIGSERIAL PRIMARY KEY,
    id_setor UUID REFERENCES setores_urbanos(id_setor),
    id_predicao BIGINT REFERENCES predicoes_modelo_ia(id_predicao),
    nivel_risco VARCHAR(20) NOT NULL CHECK (nivel_risco IN ('Baixo', 'Atenção', 'Elevado', 'Crítico')),
    mensagem TEXT NOT NULL,
    acoes_recomendadas TEXT NOT NULL,
    emitido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. ÍNDICES DE DESEMPENHO E OTIMIZAÇÃO (SUPORTE AO DASHBOARD E AO BACKEND)
CREATE INDEX idx_medicoes_tempo ON medicoes_ambientais(data_hora);
CREATE INDEX idx_predicoes_alvo ON predicoes_modelo_ia(data_hora_alvo);
CREATE INDEX idx_iicu_valor ON intensidade_ilha_calor_urbana(valor_iicu);

-- Índices adicionais para consultas do dashboard e integração com APIs.
CREATE INDEX IF NOT EXISTS idx_medicoes_setor_tempo ON medicoes_ambientais(id_setor, data_hora DESC);
CREATE INDEX IF NOT EXISTS idx_iitr_medicao ON indice_intensidade_termica_relativa(id_medicao);
CREATE INDEX IF NOT EXISTS idx_iicu_medicao ON intensidade_ilha_calor_urbana(id_medicao);
CREATE INDEX IF NOT EXISTS idx_alertas_setor_data ON sistema_alertas(id_setor, emitido_em DESC);

-- Permite que a API pública leia os resultados científicos. A escrita fica restrita
-- ao backend/Edge Function com service role.
GRANT SELECT ON setores_urbanos, fontes_dados, medicoes_ambientais, indice_forcamento_termico,
  indice_influencia_adveccional, indice_intensidade_termica_relativa, intensidade_ilha_calor_urbana,
  indice_persistencia_termica, predicoes_modelo_ia, sistema_alertas TO anon, authenticated;

-- Catálogo inicial do SIPIC-RP (Ribeirão Preto).
INSERT INTO setores_urbanos
  (codigo_setor, nome_regiao, tipo_area, latitude, longitude, altitude_z, uso_solo_lulc,
   cobertura_vegetal, area_construida_pct, densidade_edificacoes, altura_media_edificios)
VALUES
  ('RP-CENTRO-04', 'Centro / Quadrilátero Central', 'Urbana', -21.1775, -47.8103, 560, 'Urbano denso', 'Baixa', 91.00, 0.88, 3.35),
  ('RP-LESTE-02', 'Zona Leste / Distrito Industrial', 'Urbana', -21.1480, -47.7650, 570, 'Industrial', 'Baixa', 94.00, 0.72, 3.60),
  ('RP-NORTE-07', 'Campos Elíseos', 'Urbana', -21.1600, -47.8000, 555, 'Residencial denso', 'Baixa-média', 84.00, 0.81, 2.85),
  ('RP-OESTE-03', 'Zona Oeste / Ipiranga', 'Urbana', -21.1680, -47.8370, 565, 'Misto', 'Média', 73.00, 0.66, 2.10),
  ('RP-SUL-05', 'Zona Sul / Jardim Botânico', 'Urbana', -21.2150, -47.7950, 545, 'Residencial arborizado', 'Alta', 54.00, 0.48, 1.10),
  ('RP-NORTE-01', 'Zona Norte / Quintino Facci', 'Urbana', -21.1450, -47.8250, 550, 'Residencial', 'Média', 69.00, 0.57, 1.85),
  ('RP-OESTE-09', 'Campus USP / Monte Alegre', 'Urbana', -21.1650, -47.8550, 575, 'Campus/vegetado', 'Alta', 31.00, 0.25, 0.35),
  ('RP-REF-01', 'Referência periurbana', 'Referencia', -21.2400, -47.7200, 535, 'Periurbano/rural', 'Alta', 18.00, 0.12, -0.70)
ON CONFLICT (codigo_setor) DO UPDATE SET
  nome_regiao = excluded.nome_regiao,
  tipo_area = excluded.tipo_area,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  altitude_z = excluded.altitude_z,
  uso_solo_lulc = excluded.uso_solo_lulc,
  cobertura_vegetal = excluded.cobertura_vegetal,
  area_construida_pct = excluded.area_construida_pct,
  densidade_edificacoes = excluded.densidade_edificacoes,
  altura_media_edificios = excluded.altura_media_edificios;

INSERT INTO fontes_dados (nome_fonte, tipo_dado) VALUES
  ('Open-Meteo', 'Meteorologia'),
  ('OpenWeather', 'Meteorologia'),
  ('CAMS via Open-Meteo', 'Qualidade do ar'),
  ('NASA POWER', 'Radiação e reanálise'),
  ('INMET', 'Estação meteorológica')
ON CONFLICT DO NOTHING;

-- RLS: leitura pública dos dados científicos; gravação somente pelo backend/service role.
ALTER TABLE setores_urbanos ENABLE ROW LEVEL SECURITY;
ALTER TABLE fontes_dados ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicoes_ambientais ENABLE ROW LEVEL SECURITY;
ALTER TABLE indice_forcamento_termico ENABLE ROW LEVEL SECURITY;
ALTER TABLE indice_influencia_adveccional ENABLE ROW LEVEL SECURITY;
ALTER TABLE indice_intensidade_termica_relativa ENABLE ROW LEVEL SECURITY;
ALTER TABLE intensidade_ilha_calor_urbana ENABLE ROW LEVEL SECURITY;
ALTER TABLE indice_persistencia_termica ENABLE ROW LEVEL SECURITY;
ALTER TABLE predicoes_modelo_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_alertas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sipic_public_read_setores ON setores_urbanos;
CREATE POLICY sipic_public_read_setores ON setores_urbanos FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS sipic_public_read_fontes ON fontes_dados;
CREATE POLICY sipic_public_read_fontes ON fontes_dados FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS sipic_public_read_medicoes ON medicoes_ambientais;
CREATE POLICY sipic_public_read_medicoes ON medicoes_ambientais FOR SELECT TO anon, authenticated USING (data_hora >= now() - interval '30 days');
DROP POLICY IF EXISTS sipic_public_read_iitr ON indice_intensidade_termica_relativa;
CREATE POLICY sipic_public_read_iitr ON indice_intensidade_termica_relativa FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS sipic_public_read_iicu ON intensidade_ilha_calor_urbana;
CREATE POLICY sipic_public_read_iicu ON intensidade_ilha_calor_urbana FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS sipic_public_read_ift ON indice_forcamento_termico;
CREATE POLICY sipic_public_read_ift ON indice_forcamento_termico FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS sipic_public_read_iia ON indice_influencia_adveccional;
CREATE POLICY sipic_public_read_iia ON indice_influencia_adveccional FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS sipic_public_read_ipt ON indice_persistencia_termica;
CREATE POLICY sipic_public_read_ipt ON indice_persistencia_termica FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS sipic_public_read_predictions ON predicoes_modelo_ia;
CREATE POLICY sipic_public_read_predictions ON predicoes_modelo_ia FOR SELECT TO anon, authenticated USING (data_hora_alvo >= now() - interval '2 days');
DROP POLICY IF EXISTS sipic_public_read_alerts ON sistema_alertas;
CREATE POLICY sipic_public_read_alerts ON sistema_alertas FOR SELECT TO anon, authenticated USING (true);

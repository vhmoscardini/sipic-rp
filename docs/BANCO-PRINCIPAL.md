# Banco principal do SIPIC-RP

A versão final do projeto agora inclui o esquema científico fornecido pelo grupo em:

- `supabase/banco-principal.sql`
- `supabase/migrations/20260910000000_sipic_scientific_primary.sql`

## Fluxo de dados

```text
Open-Meteo / OpenWeather / CAMS / NASA POWER
                    ↓
              Backend SIPIC-RP
                    ↓
          Banco científico principal
                    ↓
       Índices / previsões / alertas
                    ↓
                Dashboard
```

O navegador não precisa consultar diretamente as fontes externas quando o modo de banco principal está ativo.

## Como ativar

No `.env` local ou nas variáveis de ambiente da Vercel:

```env
SIPIC_PRIMARY_DB=true
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=SUA_CHAVE_ANON
SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_SERVICE_ROLE
```

**A `SUPABASE_SERVICE_ROLE_KEY` deve ficar somente no backend/Vercel. Nunca coloque essa chave em `config.js`, `app.js`, HTML ou no navegador.**

## Aplicação do banco

No Supabase, execute primeiro `supabase/banco-principal.sql` ou aplique a migration pelo Supabase CLI. Ela cria:

- `setores_urbanos`
- `fontes_dados`
- `medicoes_ambientais`
- `indice_forcamento_termico`
- `indice_influencia_adveccional`
- `indice_intensidade_termica_relativa`
- `intensidade_ilha_calor_urbana`
- `indice_persistencia_termica`
- `predicoes_modelo_ia`
- `sistema_alertas`

Também inclui catálogo inicial de Ribeirão Preto, índices de consulta, restrições contra duplicação e RLS de leitura pública.

## Sincronização

Com `SIPIC_PRIMARY_DB=true`, uma consulta ao `/api/dashboard` dispara a sincronização do ciclo atual:

1. consulta a meteorologia da Open-Meteo;
2. localiza os setores no banco;
3. grava as medições em `medicoes_ambientais`;
4. calcula/persiste IICU e IITR;
5. grava previsões de 48 horas em `predicoes_modelo_ia`;
6. monta o dashboard lendo novamente o banco.

Assim, o banco deixa de ser apenas um catálogo e passa a ser a **fonte principal persistida do dashboard**.

## Contingência

Se as credenciais do banco principal não estiverem configuradas, o projeto mantém o comportamento anterior baseado na Edge Function e nas fontes científicas públicas. Isso evita quebrar a demonstração local enquanto o Supabase ainda não estiver configurado.

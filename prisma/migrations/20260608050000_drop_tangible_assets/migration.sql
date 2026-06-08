-- Descontinua a DEPRECIAÇÃO DE EQUIPAMENTOS (ativos tangíveis): o dado é difícil de
-- mensurar e pode estar incorreto, poluindo a DRE. Mantém ativos INTANGÍVEIS
-- (amortização de software/licenças/marcas). Apaga os registros tangíveis existentes
-- (decisão do produto). FixedAsset é folha (nada referencia ele), então o DELETE é seguro.
DELETE FROM "FixedAsset" WHERE "kind" = 'TANGIVEL';

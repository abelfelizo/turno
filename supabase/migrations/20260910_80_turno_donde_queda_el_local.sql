-- DÓNDE QUEDA EL LOCAL, DICHO COMO LO DICE LA GENTE
--
-- Pedido desde el teléfono: el formulario de la barbería necesita una dirección
-- más completa, con país y con selector de moneda.
--
-- Hasta ahora la dirección era UN campo de texto libre y el país no existía en
-- ninguna parte. Con un solo campo, cada dueño escribe lo que le parece —unos
-- la calle, otros el sector, otros "al lado del colmado"— y después no hay
-- forma de ordenar, ni de buscar por ciudad, ni de saber en qué país está el
-- local para nada. La moneda ya existía pero nadie la elegía: se fijaba al
-- crear el negocio y no se podía cambiar desde ninguna pantalla.
--
-- Los campos son los que se usan AQUÍ para explicar dónde queda un sitio. En
-- República Dominicana una dirección sin sector no ubica a nadie, y el punto de
-- referencia —"frente al colmado", "subiendo la loma"— no es un adorno: es
-- literalmente cómo llega el cliente. Por eso van como campos y no dentro del
-- texto libre.
--
-- `direccion` se queda como estaba, con la calle y el número: lo que ya
-- escribieron los locales existentes sigue valiendo y no hay que migrar nada.

alter table turno_negocios add column if not exists pais text;
alter table turno_negocios add column if not exists ciudad text;
alter table turno_negocios add column if not exists sector text;
alter table turno_negocios add column if not exists referencia text;

comment on column turno_negocios.pais is
  'ISO-2 del país (DO, US, ES…). De él salen la moneda y la zona horaria que se '
  'proponen al elegirlo, pero las dos se guardan aparte porque el dueño puede '
  'cobrar en otra moneda.';
comment on column turno_negocios.sector is
  'El barrio. En RD una dirección sin sector no ubica a nadie.';
comment on column turno_negocios.referencia is
  'Cómo se llega: "frente al colmado", "subiendo la loma". Es lo que de verdad '
  'usa el cliente para encontrar el local.';

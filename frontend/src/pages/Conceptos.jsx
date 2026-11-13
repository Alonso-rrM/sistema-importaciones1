import PantallaCatalogo from '../components/catalogo/PantallaCatalogo';
import { CONCEPTOS } from './catalogos/definiciones';

export default function Conceptos() {
  return <PantallaCatalogo definicion={CONCEPTOS} />;
}

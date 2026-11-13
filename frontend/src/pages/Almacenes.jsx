import PantallaCatalogo from '../components/catalogo/PantallaCatalogo';
import { ALMACENES } from './catalogos/definiciones';

export default function Almacenes() {
  return <PantallaCatalogo definicion={ALMACENES} />;
}

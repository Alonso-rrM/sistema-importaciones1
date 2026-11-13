import PantallaCatalogo from '../components/catalogo/PantallaCatalogo';
import { PROVEEDORES } from './catalogos/definiciones';

export default function Proveedores() {
  return <PantallaCatalogo definicion={PROVEEDORES} />;
}

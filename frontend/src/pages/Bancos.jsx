import PantallaCatalogo from '../components/catalogo/PantallaCatalogo';
import { BANCOS } from './catalogos/definiciones';

export default function Bancos() {
  return <PantallaCatalogo definicion={BANCOS} />;
}

import * as handoverService from './service/handoverService.js';
import { handoverRepository } from './repository/handoverRepository.js';

export const handoverModule = {
  ...handoverService,
  repository: handoverRepository
};

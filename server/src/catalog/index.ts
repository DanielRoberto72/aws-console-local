import type { CatalogContext } from './context.js';
import { comprehendService, pollyService, rekognitionService, textractService, transcribeService, translateService } from './services/ai.js';
import { athenaService, firehoseService, glueService, kafkaService, kinesisService, mqService, openSearchService } from './services/analytics.js';
import { autoScalingService, ec2Service, elbService } from './services/compute.js';
import { ecrService, ecsService, eksService } from './services/containers.js';
import { elastiCacheService, rdsService, redshiftService } from './services/databases.js';
import { cloudFormationService, cloudWatchService } from './services/management.js';
import { apiGatewayService, route53Service } from './services/networking.js';
import { cognitoService, kmsService, wafService } from './services/security.js';
import { appSyncService, efsService } from './services/storageAndWeb.js';
import type { CatalogService } from './types.js';

/**
 * Serviços do catálogo na ordem de restauração: quem é referenciado vem antes
 * (VPCs e sub-redes antes de balanceadores, bancos do Glue antes do Athena).
 */
export function catalogServices(ctx: CatalogContext): CatalogService[] {
  return [
    cloudFormationService(ctx),
    ec2Service(ctx),
    elbService(ctx),
    autoScalingService(ctx),
    ecsService(ctx),
    ecrService(ctx),
    eksService(ctx),
    efsService(ctx),
    rdsService(ctx),
    elastiCacheService(ctx),
    redshiftService(ctx),
    glueService(ctx),
    athenaService(ctx),
    kinesisService(ctx),
    firehoseService(ctx),
    openSearchService(ctx),
    kafkaService(ctx),
    mqService(ctx),
    cloudWatchService(ctx),
    cognitoService(ctx),
    kmsService(ctx),
    wafService(ctx),
    apiGatewayService(ctx),
    route53Service(ctx),
    appSyncService(ctx),
    rekognitionService(ctx),
    transcribeService(ctx),
    textractService(ctx),
    comprehendService(ctx),
    translateService(ctx),
    pollyService(ctx),
  ];
}

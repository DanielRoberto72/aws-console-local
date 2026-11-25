import {
  ComprehendClient,
  DetectDominantLanguageCommand,
  DetectEntitiesCommand,
  DetectKeyPhrasesCommand,
  DetectSentimentCommand,
} from '@aws-sdk/client-comprehend';
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { CreateCollectionCommand, DeleteCollectionCommand, DetectLabelsCommand, DetectTextCommand, ListCollectionsCommand, RekognitionClient } from '@aws-sdk/client-rekognition';
import { DetectDocumentTextCommand, TextractClient } from '@aws-sdk/client-textract';
import {
  DeleteTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  ListTranscriptionJobsCommand,
  StartTranscriptionJobCommand,
  TranscribeClient,
} from '@aws-sdk/client-transcribe';
import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate';
import type { CatalogContext } from '../context.js';
import { iso, paginate, status, str } from '../helpers.js';
import type { CatalogService, FieldSpec } from '../types.js';

const SAMPLE_NOTE = 'O emulador não roda modelos de IA: as respostas têm o formato da AWS, mas o conteúdo é de exemplo. Serve para testar a integração do seu código.';

const s3Object: FieldSpec[] = [
  { name: 'bucket', label: 'Bucket', type: 'select', source: 's3-buckets', required: true },
  { name: 'key', label: 'Chave do objeto', type: 'text', required: true, placeholder: 'imagens/foto.jpg' },
];

const textField: FieldSpec = { name: 'text', label: 'Texto', type: 'textarea', required: true, rows: 4 };
const languageField: FieldSpec = {
  name: 'language',
  label: 'Idioma',
  type: 'select',
  default: 'en',
  required: true,
  options: [
    { value: 'en', label: 'Inglês (en)' },
    { value: 'pt', label: 'Português (pt)' },
    { value: 'es', label: 'Espanhol (es)' },
  ],
};

export function comprehendService(ctx: CatalogContext): CatalogService {
  const comprehend = () => ctx.client(ComprehendClient);
  return {
    id: 'comprehend',
    name: 'Comprehend',
    description: 'Processamento de linguagem natural',
    category: 'Machine Learning',
    notes: `${SAMPLE_NOTE} A detecção de sentimento só aceita inglês.`,
    types: [],
    tools: [
      {
        key: 'DetectDominantLanguage',
        label: 'Detectar idioma',
        fields: [textField],
        async run(_id, input) {
          return { kind: 'json', value: (await comprehend().send(new DetectDominantLanguageCommand({ Text: str(input, 'text') }))).Languages };
        },
      },
      {
        key: 'DetectSentiment',
        label: 'Detectar sentimento',
        fields: [textField, languageField],
        async run(_id, input) {
          const result = await comprehend().send(new DetectSentimentCommand({ Text: str(input, 'text'), LanguageCode: str(input, 'language') as never }));
          return { kind: 'json', value: { Sentiment: result.Sentiment, SentimentScore: result.SentimentScore } };
        },
      },
      {
        key: 'DetectEntities',
        label: 'Detectar entidades',
        fields: [textField, languageField],
        async run(_id, input) {
          return { kind: 'json', value: (await comprehend().send(new DetectEntitiesCommand({ Text: str(input, 'text'), LanguageCode: str(input, 'language') as never }))).Entities };
        },
      },
      {
        key: 'DetectKeyPhrases',
        label: 'Detectar frases-chave',
        fields: [textField, languageField],
        async run(_id, input) {
          return { kind: 'json', value: (await comprehend().send(new DetectKeyPhrasesCommand({ Text: str(input, 'text'), LanguageCode: str(input, 'language') as never }))).KeyPhrases };
        },
      },
    ],
  };
}

export function translateService(ctx: CatalogContext): CatalogService {
  return {
    id: 'translate',
    name: 'Translate',
    description: 'Tradução automática',
    category: 'Machine Learning',
    notes: `${SAMPLE_NOTE} A "tradução" devolve o texto original marcado com os idiomas.`,
    types: [],
    tools: [
      {
        key: 'TranslateText',
        label: 'Traduzir texto',
        submitLabel: 'Traduzir',
        fields: [
          textField,
          { name: 'source', label: 'Idioma de origem', type: 'text', required: true, default: 'auto' },
          { name: 'target', label: 'Idioma de destino', type: 'text', required: true, default: 'en' },
        ],
        async run(_id, input) {
          const result = await ctx.client(TranslateClient).send(
            new TranslateTextCommand({ Text: str(input, 'text'), SourceLanguageCode: str(input, 'source'), TargetLanguageCode: str(input, 'target') }),
          );
          return { kind: 'text', text: result.TranslatedText ?? '' };
        },
      },
    ],
  };
}

const VOICES = [
  { value: 'Camila', label: 'Camila (pt-BR)' },
  { value: 'Vitoria', label: 'Vitória (pt-BR)' },
  { value: 'Ricardo', label: 'Ricardo (pt-BR)' },
  { value: 'Joanna', label: 'Joanna (en-US)' },
  { value: 'Matthew', label: 'Matthew (en-US)' },
];

export function pollyService(ctx: CatalogContext): CatalogService {
  return {
    id: 'polly',
    name: 'Polly',
    description: 'Conversão de texto em fala',
    category: 'Machine Learning',
    notes: `${SAMPLE_NOTE} O áudio é um MP3 válido, mas não contém a fala do texto.`,
    types: [],
    tools: [
      {
        key: 'SynthesizeSpeech',
        label: 'Sintetizar fala',
        submitLabel: 'Sintetizar',
        fields: [textField, { name: 'voice', label: 'Voz', type: 'select', options: VOICES, default: 'Camila', required: true }],
        async run(_id, input) {
          const { AudioStream, ContentType } = await ctx.client(PollyClient).send(
            new SynthesizeSpeechCommand({ Text: str(input, 'text'), VoiceId: str(input, 'voice') as never, OutputFormat: 'mp3' }),
          );
          const bytes = AudioStream ? await AudioStream.transformToByteArray() : new Uint8Array();
          return { kind: 'audio', contentType: ContentType ?? 'audio/mpeg', base64: Buffer.from(bytes).toString('base64') };
        },
      },
    ],
  };
}

export function rekognitionService(ctx: CatalogContext): CatalogService {
  const rekognition = () => ctx.client(RekognitionClient);
  return {
    id: 'rekognition',
    name: 'Rekognition',
    description: 'Análise de imagens',
    category: 'Machine Learning',
    notes: `${SAMPLE_NOTE} As imagens são lidas de objetos do S3 do emulador.`,
    types: [
      {
        key: 'collection',
        label: 'Coleções',
        singular: 'coleção',
        columns: [],
        async list() {
          const ids = await paginate(async (NextToken) => {
            const page = await rekognition().send(new ListCollectionsCommand({ NextToken }));
            return { items: page.CollectionIds, next: page.NextToken };
          });
          return ids.map((id) => ({ id, name: id, attrs: {} }));
        },
        create: {
          label: 'Criar coleção',
          fields: [{ name: 'id', label: 'ID da coleção', type: 'text', required: true, pattern: '^[a-zA-Z0-9_.-]{1,255}$' }],
          async run(input) {
            await rekognition().send(new CreateCollectionCommand({ CollectionId: str(input, 'id') }));
            return { id: str(input, 'id') };
          },
        },
        remove: {
          async run(id) {
            await rekognition().send(new DeleteCollectionCommand({ CollectionId: id }));
          },
        },
        async persist(row) {
          return { id: row.id };
        },
      },
    ],
    tools: [
      {
        key: 'DetectLabels',
        label: 'Detectar rótulos',
        fields: s3Object,
        async run(_id, input) {
          const result = await rekognition().send(new DetectLabelsCommand({ Image: { S3Object: { Bucket: str(input, 'bucket'), Name: str(input, 'key') } } }));
          return { kind: 'json', value: result.Labels };
        },
      },
      {
        key: 'DetectText',
        label: 'Detectar texto em imagem',
        fields: s3Object,
        async run(_id, input) {
          const result = await rekognition().send(new DetectTextCommand({ Image: { S3Object: { Bucket: str(input, 'bucket'), Name: str(input, 'key') } } }));
          return { kind: 'json', value: result.TextDetections };
        },
      },
    ],
  };
}

export function textractService(ctx: CatalogContext): CatalogService {
  return {
    id: 'textract',
    name: 'Textract',
    description: 'Extração de texto de documentos',
    category: 'Machine Learning',
    notes: `${SAMPLE_NOTE} Os documentos são lidos de objetos do S3 do emulador.`,
    types: [],
    tools: [
      {
        key: 'DetectDocumentText',
        label: 'Extrair texto',
        fields: s3Object,
        async run(_id, input) {
          const { Blocks = [] } = await ctx.client(TextractClient).send(
            new DetectDocumentTextCommand({ Document: { S3Object: { Bucket: str(input, 'bucket'), Name: str(input, 'key') } } }),
          );
          const lines = Blocks.filter((b) => b.BlockType === 'LINE').map((b) => [b.Text ?? '', b.Confidence ?? null]);
          return { kind: 'table', columns: ['Linha', 'Confiança'], rows: lines };
        },
      },
    ],
  };
}

export function transcribeService(ctx: CatalogContext): CatalogService {
  const transcribe = () => ctx.client(TranscribeClient);
  return {
    id: 'transcribe',
    name: 'Transcribe',
    description: 'Conversão de fala em texto',
    category: 'Machine Learning',
    notes: `${SAMPLE_NOTE} Os trabalhos são histórico e não são salvos no banco.`,
    types: [
      {
        key: 'job',
        label: 'Trabalhos de transcrição',
        singular: 'trabalho de transcrição',
        columns: [
          { key: 'language', label: 'Idioma' },
          { key: 'createdAt', label: 'Criação' },
          { key: 'completedAt', label: 'Conclusão' },
        ],
        async list() {
          const jobs = await paginate(async (NextToken) => {
            const page = await transcribe().send(new ListTranscriptionJobsCommand({ NextToken }));
            return { items: page.TranscriptionJobSummaries, next: page.NextToken };
          });
          return jobs.map((j) => ({
            id: j.TranscriptionJobName!,
            name: j.TranscriptionJobName!,
            status: status(j.TranscriptionJobStatus),
            attrs: { language: j.LanguageCode ?? null, createdAt: iso(j.CreationTime), completedAt: iso(j.CompletionTime) },
          }));
        },
        async describe(id) {
          return (await transcribe().send(new GetTranscriptionJobCommand({ TranscriptionJobName: id }))).TranscriptionJob ?? null;
        },
        create: {
          label: 'Criar trabalho',
          fields: [
            { name: 'name', label: 'Nome do trabalho', type: 'text', required: true, pattern: '^[0-9a-zA-Z._-]{1,200}$' },
            { name: 'mediaUri', label: 'Arquivo de áudio no S3', type: 'text', required: true, placeholder: 's3://meu-bucket/audio.mp3', pattern: '^s3://.+' },
            {
              name: 'language',
              label: 'Idioma',
              type: 'select',
              default: 'pt-BR',
              options: [
                { value: 'pt-BR', label: 'Português (Brasil)' },
                { value: 'en-US', label: 'Inglês (EUA)' },
                { value: 'es-ES', label: 'Espanhol (Espanha)' },
              ],
            },
          ],
          async run(input) {
            await transcribe().send(
              new StartTranscriptionJobCommand({
                TranscriptionJobName: str(input, 'name'),
                LanguageCode: (str(input, 'language') || 'pt-BR') as never,
                Media: { MediaFileUri: str(input, 'mediaUri') },
              }),
            );
            return { id: str(input, 'name') };
          },
        },
        remove: {
          async run(id) {
            await transcribe().send(new DeleteTranscriptionJobCommand({ TranscriptionJobName: id }));
          },
        },
      },
    ],
  };
}
